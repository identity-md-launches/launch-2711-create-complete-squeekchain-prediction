import { createPublicClient, fallback, http, type Address } from 'viem';
import { chain } from './config';
import { network } from './network';
import { coreAbi } from './coreAbi';

/* Certified wheel history from SqueekCore. Every number is the difference between whole-block
 * heights at two certified round endpoints, the same rule SqueekPredict uses to resolve. */
const ROUND = 600;
const UNITS = 1_000_000_000n;
const batched = createPublicClient({
  chain,
  transport: fallback(network.rpcUrls.map(url => http(url, { timeout: 12000, retryCount: 1, batch: { batchSize: 40 } })), { retryCount: 0 }),
});

export type WheelStats = {
  settledRound: number;
  settledAt: number;
  /** Blocks completed in each certified round of the last 24 certified hours, oldest first. */
  perRound: number[];
  /** Blocks completed in each certified hour of the last 7 certified days, oldest first. */
  hourly: number[];
  windows: { label: string; hours: number; blocks: number }[];
  longestRunMinutes: number;
  currentRunMinutes: number;
  activeRounds24: number;
  dayparts: { name: string; hours: string; blocks: number }[];
  best24: number;
  average24: number;
  total7d: number;
};

/** Pure: turns whole-block heights at round endpoints into the stats shown on the site. */
export function computeStats(settledRound: number, genesis: number, roundHeights: Map<number, number>): WheelStats {
  const at = (r: number) => {
    // Before genesis no blocks exist. A missing certified endpoint is unknown, never zero.
    if (r < 0) return 0;
    const height = roundHeights.get(r);
    if (height === undefined) throw new Error('Wheel history is incomplete. Retry in a moment.');
    return height;
  };
  const diff = (a: number, b: number) => Math.max(0, at(a) - at(b));
  const perRound: number[] = [];
  for (let r = settledRound - 143; r <= settledRound; r++) perRound.push(diff(r, r - 1));
  const hourly: number[] = [];
  for (let h = 167; h >= 0; h--) hourly.push(diff(settledRound - h * 6, settledRound - h * 6 - 6));
  let longest = 0, run = 0;
  for (const b of perRound) { run = b > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  const windows = [1, 3, 6, 12, 24, 168].map(hours => ({ label: hours === 168 ? '7 days' : `${hours}h`, hours, blocks: diff(settledRound, settledRound - hours * 6) }));
  const dayparts = [
    { name: 'Night', hours: '00 to 06h', blocks: 0 }, { name: 'Morning', hours: '06 to 12h', blocks: 0 },
    { name: 'Afternoon', hours: '12 to 18h', blocks: 0 }, { name: 'Evening', hours: '18 to 24h', blocks: 0 },
  ];
  hourly.forEach((blocks, i) => {
    const hourStart = genesis + (settledRound - (167 - i) * 6 - 6) * ROUND;
    dayparts[Math.floor(new Date(hourStart * 1000).getHours() / 6)].blocks += blocks;
  });
  let best24 = 0;
  for (let i = 0; i + 24 <= hourly.length; i++) best24 = Math.max(best24, hourly.slice(i, i + 24).reduce((a, b) => a + b, 0));
  const total7d = windows[5].blocks;
  return {
    settledRound, settledAt: genesis + settledRound * ROUND, perRound, hourly, windows,
    longestRunMinutes: longest * 10, currentRunMinutes: run * 10, activeRounds24: perRound.filter(b => b > 0).length,
    dayparts, best24, average24: Math.round(total7d / 7), total7d,
  };
}

export async function readWheelStats(core: Address, settledRound: bigint, genesis: bigint): Promise<WheelStats> {
  const settled = Number(settledRound);
  const wanted = new Set<number>();
  for (let r = settled - 144; r <= settled; r++) wanted.add(r);
  for (let h = 0; h <= 168; h++) wanted.add(settled - h * 6);
  const rounds = [...wanted].filter(r => r >= 0).sort((a, b) => b - a);
  const heights = new Map<number, number>();
  const results = await Promise.allSettled(rounds.map(r => batched.readContract({ address: core, abi: coreAbi, functionName: 'roundPage', args: [BigInt(r), BigInt(r), 0n] })));
  results.forEach((res, i) => {
    if (res.status === 'fulfilled' && res.value.certifiedThroughRound === BigInt(rounds[i])) heights.set(rounds[i], Number(res.value.end.cumulativeBlockUnits / UNITS));
  });
  if (heights.size !== rounds.length) throw new Error('Wheel history is incomplete. Retry in a moment.');
  return computeStats(settled, Number(genesis), heights);
}
