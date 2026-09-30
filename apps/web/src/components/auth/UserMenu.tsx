import { LogOut } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { clearToken } from '../../lib/auth.js';
import { useAuth } from '../../hooks/use-auth.js';

export function UserMenu() {
  const { data: user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    clearToken();
    queryClient.clear();
    navigate({ to: '/login' });
  };

  if (!user) return null;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-700">{user.email}</p>
      </div>
      <button
        onClick={handleLogout}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        title="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
