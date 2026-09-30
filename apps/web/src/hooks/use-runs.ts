import { useQuery } from '@tanstack/react-query';
import { getRuns } from '../lib/api.js';

export function useRuns() {
  return useQuery({
    queryKey: ['runs'],
    queryFn: getRuns,
    staleTime: 10_000,
  });
}
