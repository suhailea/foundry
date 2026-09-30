import { useQuery } from '@tanstack/react-query';
import { getRunById } from '../lib/api.js';

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['runs', runId],
    queryFn: () => getRunById(runId),
    staleTime: 5_000,
  });
}
