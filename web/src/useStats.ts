import { useQuery } from '@tanstack/react-query';
import type { Snapshot } from './data';
import { readWheelStats } from './history';
export function useWheelStats(data?: Snapshot) {
  const settled = data?.coreState?.settledThroughRound;
  const genesis = data?.coreConfig?.genesisTimestamp;
  return useQuery({
    queryKey: ['wheel', data?.coreAddress, settled?.toString()],
    queryFn: () => readWheelStats(data!.coreAddress, settled!, genesis!),
    enabled: Boolean(data && settled !== undefined && genesis !== undefined && settled > 150n),
    staleTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false,
  });
}
