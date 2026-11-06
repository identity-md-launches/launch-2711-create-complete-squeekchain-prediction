import { keccak256, type Address } from "viem";
import { publicClient, PREDICT_ADDRESS, chain } from "./config";
import { predictAbi } from "./predictAbi";
import { coreAbi } from "./coreAbi";
import { EXPECTED_RUNTIME_HASH } from "./verification";
import type { Market, Position } from "./model";
import type { PracticeResult, TemplateMarket } from "./catalog";

export async function verifyContract(blockNumber?: bigint) {
  const [chainId, code] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBytecode({ address: PREDICT_ADDRESS, blockNumber }),
  ]);
  if (
    chainId !== chain.id ||
    !code ||
    keccak256(code) !== EXPECTED_RUNTIME_HASH
  )
    throw new Error(
      "Contract verification failed. Transactions are unavailable.",
    );
}
export async function readSnapshot(
  address: Address | undefined,
  limit: number,
  lookup?: bigint,
) {
  const block = await publicClient.getBlock();
  await verifyContract(block.number);
  const read = {
    address: PREDICT_ADDRESS,
    abi: predictAbi,
    blockNumber: block.number,
  } as const;
  const [count, coreAddress] = await Promise.all([
    publicClient.readContract({ ...read, functionName: "marketCount" }),
    publicClient.readContract({ ...read, functionName: "CORE" }),
  ]);
  const ids: bigint[] = [];
  for (let id = count; id > 0n && ids.length < limit; id--) ids.push(id);
  if (lookup && lookup <= count && !ids.includes(lookup)) ids.push(lookup);
  // Small batches prevent one RPC request storm as the list grows.
  const markets: Market[] = [];
  const positions: Record<string, Position> = {};
  for (let i = 0; i < ids.length; i += 6) {
    const batch = await Promise.all(
      ids.slice(i, i + 6).map(async (id) => {
        const m = await publicClient.readContract({
          ...read,
          functionName: "getMarket",
          args: [id],
        });
        if (address) {
          const [p, claimable] = await Promise.all([
            publicClient.readContract({
              ...read,
              functionName: "positions",
              args: [id, address],
            }),
            publicClient.readContract({
              ...read,
              functionName: "claimable",
              args: [id, address],
            }),
          ]);
          positions[String(id)] = {
            yes: p[0],
            no: p[1],
            claimed: p[2],
            claimable,
          };
        }
        return { ...m, id };
      }),
    );
    markets.push(...batch);
  }
  const [coreState, coreConfig] = await Promise.allSettled([
    publicClient.readContract({
      address: coreAddress,
      abi: coreAbi,
      functionName: "state",
      blockNumber: block.number,
    }),
    publicClient.readContract({
      address: coreAddress,
      abi: coreAbi,
      functionName: "configuration",
      blockNumber: block.number,
    }),
  ]);
  return {
    count,
    markets,
    positions,
    blockNumber: block.number,
    timestamp: block.timestamp,
    fetchedAt: Date.now(),
    coreAddress,
    coreState: coreState.status === "fulfilled" ? coreState.value : undefined,
    coreConfig:
      coreConfig.status === "fulfilled" ? coreConfig.value : undefined,
  };
}
export type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
/** Informational template results. No fabricated outcome when a certified endpoint is missing. */
export async function readPracticeResults(
  snapshot: Snapshot,
  markets: TemplateMarket[],
) {
  const results: Record<string, PracticeResult> = {};
  const cfg = snapshot.coreConfig;
  if (
    !cfg ||
    !snapshot.coreState ||
    cfg.roundDuration !== 600n ||
    cfg.blockUnitsPerBlock !== 1_000_000_000n
  )
    return results;
  const heights = new Map<bigint, bigint>();
  const rounds = new Set<bigint>();
  const eligible = markets.filter((m) => {
    const start = BigInt(m.startsAt) - cfg.genesisTimestamp;
    const end = BigInt(m.endsAt) - cfg.genesisTimestamp;
    if (
      start < 0n ||
      start % 600n !== 0n ||
      end % 600n !== 0n ||
      end / 600n > snapshot.coreState!.settledThroughRound
    )
      return false;
    rounds.add(start / 600n);
    rounds.add(end / 600n);
    return true;
  });
  for (const round of rounds) {
    try {
      const page = await publicClient.readContract({
        address: snapshot.coreAddress,
        abi: coreAbi,
        blockNumber: snapshot.blockNumber,
        functionName: "roundPage",
        args: [round, round, 0n],
      });
      if (page.certifiedThroughRound === round)
        heights.set(
          round,
          page.end.cumulativeBlockUnits / cfg.blockUnitsPerBlock,
        );
    } catch {
      /* Keep unavailable endpoints unresolved. */
    }
  }
  for (const m of eligible) {
    const startHeight = heights.get(
      (BigInt(m.startsAt) - cfg.genesisTimestamp) / 600n,
    );
    const endHeight = heights.get(
      (BigInt(m.endsAt) - cfg.genesisTimestamp) / 600n,
    );
    if (
      startHeight !== undefined &&
      endHeight !== undefined &&
      endHeight >= startHeight
    ) {
      const blocks = endHeight - startHeight;
      results[m.id] = {
        yesWins: blocks > BigInt(m.threshold),
        blocks,
        startHeight,
        endHeight,
      };
    }
  }
  return results;
}
export type Action =
  | { functionName: "bet"; args: readonly [bigint, boolean]; value: bigint }
  | { functionName: "createMarket"; args: readonly [bigint, bigint, bigint] }
  | { functionName: "claim"; args: readonly [bigint, Address] }
  | {
      functionName: "resolve" | "cancelExpired" | "cancelUnmatched";
      args: readonly [bigint];
    };
