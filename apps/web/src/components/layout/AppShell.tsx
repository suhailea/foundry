import { Outlet } from '@tanstack/react-router';
import { Sidebar } from './Sidebar.js';

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
