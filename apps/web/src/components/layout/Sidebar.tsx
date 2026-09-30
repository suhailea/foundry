import { History, Link2, Settings, Zap } from 'lucide-react';
import { UserMenu } from '../auth/UserMenu.js';
import { Separator } from '../ui/separator.js';
import { SidebarNavItem } from './SidebarNavItem.js';

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-900">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-900 tracking-tight">Foundry</span>
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
          Workspace
        </p>
        <SidebarNavItem to="/" icon={Zap} label="New Run" />
        <SidebarNavItem to="/runs" icon={History} label="Run History" />

        <div className="mt-4">
          <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
            Configuration
          </p>
          <SidebarNavItem to="/integrations" icon={Link2} label="Integrations" />
          <SidebarNavItem to="/settings" icon={Settings} label="Settings" />
        </div>
      </nav>

      {/* Bottom */}
      <Separator />
      <UserMenu />
      <div className="px-4 pb-3">
        <p className="text-xs text-gray-400">Phase A1 · Echo agent</p>
      </div>
    </aside>
  );
}
