import { useQuery } from '@tanstack/react-query';
import { getMe } from '../lib/api.js';
import { getToken } from '../lib/auth.js';

export function useAuth() {
  return useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: !!getToken(),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
