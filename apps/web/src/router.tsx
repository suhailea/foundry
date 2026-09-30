import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { AppShell } from './components/layout/AppShell.js';
import { AuthGuard } from './components/auth/AuthGuard.js';
import { IntegrationsView } from './views/IntegrationsView.js';
import { LoginView } from './views/LoginView.js';
import { RegisterView } from './views/RegisterView.js';
import { RunDetailView } from './views/RunDetailView.js';
import { RunHistoryView } from './views/RunHistoryView.js';
import { RunView } from './views/RunView.js';
import { SettingsView } from './views/SettingsView.js';

// Single root — bare outlet so public routes render without the app shell
const rootRoute = createRootRoute({ component: Outlet });

// Public routes
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginView });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/register', component: RegisterView });

// Protected layout route — wraps AppShell with AuthGuard
function ProtectedLayout() {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  );
}

const protectedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: 'protected',
  component: ProtectedLayout,
});

const indexRoute = createRoute({ getParentRoute: () => protectedLayout, path: '/', component: RunView });
const runsRoute = createRoute({ getParentRoute: () => protectedLayout, path: '/runs', component: RunHistoryView });
const runDetailRoute = createRoute({ getParentRoute: () => protectedLayout, path: '/runs/$runId', component: RunDetailView });
const integrationsRoute = createRoute({ getParentRoute: () => protectedLayout, path: '/integrations', component: IntegrationsView });
const settingsRoute = createRoute({ getParentRoute: () => protectedLayout, path: '/settings', component: SettingsView });

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  protectedLayout.addChildren([
    indexRoute,
    runsRoute,
    runDetailRoute,
    integrationsRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
