import { Settings } from 'lucide-react';
import { EmptyState } from '../components/shared/EmptyState.js';

export function SettingsView() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-14 items-center border-b border-gray-100 px-6">
        <h1 className="text-sm font-semibold text-gray-900">Settings</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <EmptyState
          icon={Settings}
          title="Coming soon"
          description="Tenant and user settings will appear here."
        />
      </div>
    </div>
  );
}
