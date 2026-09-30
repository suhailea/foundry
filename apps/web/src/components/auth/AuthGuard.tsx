import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { getToken } from '../../lib/auth.js';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const token = getToken();

  useEffect(() => {
    if (!token) {
      navigate({ to: '/login' });
    }
  }, [token, navigate]);

  if (!token) return null;
  return <>{children}</>;
}
