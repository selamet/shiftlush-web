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
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@/api/query-client";
import { buildingListQuery, contractListQuery, customerListQuery, customerQuery } from "@/api/queries";
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

/**
 * One client for the whole application.
 *
 * Created at module scope rather than inside the component: a client rebuilt on
 * re-render throws away every cached response, and the symptom is a screen that
 * refetches everything whenever an unrelated piece of state changes.
 */
export const queryClient = createQueryClient();

const rootRoute = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider override={sessionOverride}>
        <Outlet />
      </SessionProvider>
    </QueryClientProvider>
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

type Loader = (context: { params: Record<string, string> }) => Promise<unknown>;

/**
 * A route inside the application shell, optionally prefetching its data.
 *
 * The loader warms the query cache before the component renders, so the screen
 * reads from a populated cache instead of mounting empty and filling in. Two
 * things fall out of that: navigating to a record the user just came from is
 * instant, and the render smoke test — which already awaits `router.load()` —
 * gets real content rather than a page of skeletons.
 *
 * A loader that rejects is swallowed on purpose. The component runs the same
 * query and owns the error state; letting the loader throw would replace the
 * screen's own error handling with the router's, and the user would lose the
 * retry button along with the rest of the page.
 */
function shellChild(path: string, component: () => React.ReactNode, loader?: Loader) {
  return createRoute({
    getParentRoute: () => shellRoute,
    path,
    component,
    loader: loader ? (context) => loader(context).catch(() => undefined) : undefined,
  });
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
    shellChild("/customers", CustomerListScreen, () =>
      queryClient.ensureQueryData(customerListQuery({ page: 1, page_size: 25 })),
    ),
    shellChild("/customers/$id", CustomerDetailScreen, async ({ params }) => {
      const id = params.id;
      // Fetched together rather than in sequence: the record and the two lists
      // beside it are one screen, and waterfalling them makes the page fill in
      // three visible steps.
      await Promise.all([
        queryClient.ensureQueryData(customerQuery(id)),
        queryClient.ensureQueryData(buildingListQuery({ customer: id, page_size: 100 })),
        queryClient.ensureQueryData(contractListQuery({ customer: id, page_size: 100 })),
      ]);
    }),
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
