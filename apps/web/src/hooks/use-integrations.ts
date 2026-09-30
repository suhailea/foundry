import { useQuery } from '@tanstack/react-query';
import { getIntegrations } from '../lib/api.js';

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: getIntegrations,
    staleTime: 30_000,
  });
}
