import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { SessionProvider, type SessionOverride } from "@/lib/session";
import type { Role } from "@/components/layout/nav-config";
import { AddressPicker } from "@/components/forms/AddressPicker";
import { LoginScreen } from "@/screens/LoginScreen";
import { ElevatorListScreen } from "@/screens/ElevatorListScreen";
import { ElevatorDetailScreen } from "@/screens/ElevatorDetailScreen";
import { ElevatorFormScreen } from "@/screens/ElevatorFormScreen";
import { CustomerListScreen } from "@/screens/CustomerListScreen";
import { CustomerDetailScreen } from "@/screens/CustomerDetailScreen";
import { ComplexListScreen } from "@/screens/ComplexListScreen";
import { BuildingListScreen } from "@/screens/BuildingListScreen";
import { ContractListScreen } from "@/screens/ContractListScreen";
import { ContractDetailScreen } from "@/screens/ContractDetailScreen";
import { UserListScreen } from "@/screens/UserListScreen";
import { AuditLogListScreen } from "@/screens/AuditLogListScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { QrLabelScreen } from "@/screens/QrLabelScreen";
import { StyleGuide } from "@/styleguide/StyleGuide";

/**
 * Set only by createRouterForPath, so the smoke test and the styleguide can
 * render the shell for a given role without a server. In the running
 * application this stays undefined and the provider restores the real session.
 */
let sessionOverride: SessionOverride | undefined;

const rootRoute = createRootRoute({
  component: () => (
    <SessionProvider override={sessionOverride}>
      <Outlet />
    </SessionProvider>
  ),
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

function shellChild(path: string, component: () => React.ReactNode) {
  return createRoute({ getParentRoute: () => shellRoute, path, component });
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/elevators" });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginScreen,
});

const styleguideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/styleguide",
  component: StyleGuide,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  styleguideRoute,
  shellRoute.addChildren([
    shellChild("/elevators", ElevatorListScreen),
    shellChild("/elevators/$id", ElevatorDetailScreen),
    shellChild("/elevators/$id/edit", ElevatorFormScreen),
    shellChild("/customers", CustomerListScreen),
    shellChild("/customers/$id", CustomerDetailScreen),
    shellChild("/complexes", ComplexListScreen),
    shellChild("/buildings", BuildingListScreen),
    // The address picker is the third step of the building form; until the
    // rest of that form exists it is reachable on its own.
    shellChild("/buildings/new", () => (
      <div className="p-6">
        <AddressPicker />
      </div>
    )),
    shellChild("/contracts", ContractListScreen),
    shellChild("/contracts/$id", ContractDetailScreen),
    shellChild("/qr-labels", QrLabelScreen),
    shellChild("/users", UserListScreen),
    shellChild("/audit-logs", AuditLogListScreen),
    shellChild("/settings", SettingsScreen),
  ]),
]);

export const router = createRouter({ routeTree });

export { RouterProvider };

/**
 * Builds a router pinned to one path, optionally as a given role. Used by the
 * render smoke test so every route is exercised through the real tree — and so
 * router internals come from this module graph rather than a second copy, which
 * would break React context.
 *
 * The role matters: sidebars, columns and whole sections are hidden per role,
 * so rendering only one of them leaves the others untested.
 */
export function createRouterForPath(path: string, role?: Role) {
  sessionOverride = role
    ? { role, fullName: "Test User", companyName: "Test Company" }
    : undefined;
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
}
