import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';

interface SidebarNavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
}

export function SidebarNavItem({ to, icon: Icon, label, disabled }: SidebarNavItemProps) {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 cursor-not-allowed select-none">
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
        <span className="ml-auto text-xs text-gray-300">Soon</span>
      </div>
    );
  }

  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
      )}
      activeProps={{ className: 'bg-gray-100 text-gray-900 font-medium' }}
      activeOptions={{ exact: to === '/' }}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
