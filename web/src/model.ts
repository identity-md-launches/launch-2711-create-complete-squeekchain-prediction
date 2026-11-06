import { formatEther, parseEther } from 'viem';
export const MIN_BET = 100000000000000n;
export const MAX_POOL = 100000000000000000000n;
export const DAY = 86400;
export const WEEK = 604800;
export type Market = {
  id: bigint; threshold: bigint; startRound: bigint; endRound: bigint;
  startsAt: bigint; endsAt: bigint; refundAt: bigint; genesisTimestamp: bigint;
  streamId: `0x${string}`; implementation: `0x${string}`; status: number; yesWins: boolean;
  startBlockUnits: bigint; endBlockUnits: bigint; yesPool: bigint; noPool: bigint;
  remainingWinningStake: bigint; remainingPayout: bigint;
};
export type Position = { yes: bigint; no: bigint; claimed: boolean; claimable: bigint };
export type Phase = 'Open for bets' | 'In progress' | 'Awaiting settlement' | 'Ready to resolve' | 'Refund available' | 'Resolved' | 'Cancelled';
export const durationName = (m: Pick<Market, 'startsAt' | 'endsAt'>) => m.endsAt - m.startsAt === BigInt(DAY) ? '24 hours' : '7 days';
export const question = (m: Pick<Market, 'threshold' | 'startsAt' | 'endsAt'>) => `Will the hamster complete more than ${m.threshold.toLocaleString()} blocks in ${durationName(m)}?`;
export function phase(m: Market, now: bigint, settled?: bigint): Phase {
  if (m.status === 1) return 'Resolved';
  if (m.status === 2) return 'Cancelled';
  if (now < m.startsAt) return 'Open for bets';
  if (now >= m.refundAt || m.yesPool === 0n || m.noPool === 0n) return 'Refund available';
  if (now < m.endsAt) return 'In progress';
  return settled !== undefined && settled >= m.endRound ? 'Ready to resolve' : 'Awaiting settlement';
}
export function amount(text: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(text.trim())) throw new Error('Enter an ETH amount with up to 18 decimal places.');
  const value = parseEther(text.trim());
  if (value < MIN_BET) throw new Error('Enter at least 0.0001 test ETH.');
  if (value > MAX_POOL) throw new Error('Each side can hold at most 100 test ETH.');
  return value;
}
export function thresholdValue(text: string) {
  if (!/^\d+$/.test(text) || BigInt(text) > (1n << 64n) - 1n) throw new Error('Enter a whole block count from 0 to 18446744073709551615.');
  return BigInt(text);
}
export function startRound(genesis: bigint, now: bigint, lead: number) {
  if (genesis <= 0n || genesis > now || ![7200, 21600, 86400].includes(lead)) throw new Error('Unable to calculate the window. Refresh chain data and retry.');
  return (now + BigInt(lead) - genesis + 599n) / 600n + 1n;
}
export function payout(m: Pick<Market, 'yesPool' | 'noPool'>, yes: boolean, stake: bigint, previous = 0n) {
  const side = yes ? m.yesPool : m.noPool;
  const opposite = yes ? m.noPool : m.yesPool;
  if (opposite === 0n) return null;
  return (previous + stake) * (m.yesPool + m.noPool + stake) / (side + stake);
}
export function eth(value: bigint, digits = 5) {
  const raw = formatEther(value);
  if (value > 0n && value < 10n ** BigInt(18 - digits)) return `<${(10 ** -digits).toFixed(digits)}`;
  const [whole, fraction] = raw.split('.');
  return fraction ? `${whole}.${fraction.slice(0, digits).replace(/0+$/, '')}`.replace(/\.$/, '') : whole;
}
export const exactEth = formatEther;
export const date = (timestamp: bigint) => new Date(Number(timestamp) * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
export function timeLeft(timestamp: bigint, now: bigint) {
  const seconds = Number(timestamp - now);
  if (seconds <= 0) return 'Closed';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m left`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m left`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h left`;
}
export function friendlyError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  if (/reject|denied|4001/i.test(text)) return 'Request declined in your wallet. You can try again.';
  if (/insufficient funds/i.test(text)) return 'Not enough Sepolia test ETH for this action and gas. Add test ETH, then retry.';
  const names: Record<string, string> = {
    BettingClosed: 'Betting has closed. Refresh to see the current market.', PoolLimit: 'This side is full. Choose a smaller stake or the other side.',
    NotSettled: 'SqueekCore has not settled this window yet. Refresh and retry later.', CorePaused: 'SqueekCore is paused. Try creating a market later.',
    CoreChanged: 'The Core configuration changed. This market can be refunded after its deadline.', AlreadyClaimed: 'This position has already been claimed. Refresh your positions.',
    NothingToClaim: 'There is no payout for this position. Refresh your positions.', InvalidStart: 'The window has moved too close. Refresh and review a new start time.',
    PaymentFailed: 'Your wallet could not receive ETH. Choose another recipient and retry.', TooEarly: 'This action is not available yet. Refresh the market.',
  };
  for (const [name, message] of Object.entries(names)) if (text.includes(name)) return message;
  if (/fetch|HTTP|network|timeout|403|429|RPC|Failed to|could not be found/i.test(text)) return 'Unable to reach Sepolia. Check your connection and retry.';
  return 'The transaction could not complete. Refresh the market and try again.';
}

/* Sportsbook presentation of the contract's rule. "More than T blocks" is Over T.5; exactly T is Under. */
export type Kind = 'Activity' | 'Daily total' | 'Weekly total' | 'Record attempt';
export const KINDS: Kind[] = ['Daily total', 'Weekly total', 'Activity', 'Record attempt'];
export function kind(m: Pick<Market, 'threshold' | 'startsAt' | 'endsAt'>, best24?: number): Kind {
  if (m.endsAt - m.startsAt !== BigInt(DAY)) return 'Weekly total';
  if (m.threshold === 0n) return 'Activity';
  if (best24 !== undefined && best24 > 0 && m.threshold >= BigInt(best24)) return 'Record attempt';
  return 'Daily total';
}
export const line = (threshold: bigint) => `${threshold.toLocaleString()}.5`;
export function title(m: Pick<Market, 'threshold' | 'startsAt' | 'endsAt'>, best24?: number) {
  void best24;
  if (m.threshold === 0n) return `Will the hamster complete a block in this ${durationName(m) === '24 hours' ? '24-hour' : '7-day'} window?`;
  return question(m);
}
export const sideName = (_m: Pick<Market, 'threshold'>, yes: boolean) => yes ? 'Yes' : 'No';
/** Current pari-mutuel multiplier for a side: total pool divided by that side's pool. */
export function odds(m: Pick<Market, 'yesPool' | 'noPool'>, yes: boolean): number | null {
  const side = yes ? m.yesPool : m.noPool;
  const total = m.yesPool + m.noPool;
  if (side === 0n || total === side) return null;
  return Number(total * 1000n / side) / 1000;
}
export const formatOdds = (value: number | null) => value === null ? 'Open' : `${value.toFixed(2)}x`;
/** Pool share, not a forecast or a fixed share price. Empty markets open at 50/50. */
export function poolPercent(m: Pick<Market, 'yesPool' | 'noPool'>, yes: boolean) {
  const total = m.yesPool + m.noPool;
  const over = total === 0n ? 50 : Number(m.yesPool * 1000n / total) / 10;
  return yes ? over : Number((100 - over).toFixed(1));
}
export const percentLabel = (value: number) => `${Number(value.toFixed(1))}%`;
/** First round whose start is at or after `timestamp`. */
export function roundAt(genesis: bigint, timestamp: bigint) {
  if (genesis <= 0n || timestamp < genesis) throw new Error('Unable to calculate the window. Refresh chain data and retry.');
  return (timestamp - genesis + 599n) / 600n + 1n;
}
export const roundStart = (genesis: bigint, round: bigint) => genesis + (round - 1n) * 600n;
/** Checks a chosen start against the contract's 1 hour to 7 day lead, keeping a 5 minute margin for confirmation. */
export function checkStart(startsAt: bigint, now: bigint) {
  if (startsAt < now + 3600n + 300n) throw new Error('Pick a start at least 65 minutes from now so the transaction can confirm in time.');
  if (startsAt > now + 604800n - 300n) throw new Error('Pick a start within the next 7 days.');
}
