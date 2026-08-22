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
import {
  buildingListQuery,
  contractListQuery,
  customerListQuery,
  customerQuery,
  elevatorAttachmentsQuery,
  elevatorListQuery,
  elevatorQuery,
  invitationPreviewQuery,
  buildingQuery,
  contractQuery,
} from "@/api/queries";
import { SessionProvider, ensureSession, type SessionOverride } from "@/lib/session";
import type { Role } from "@/components/layout/nav-config";
import { LoginScreen } from "@/screens/LoginScreen";
import { ElevatorListScreen } from "@/screens/ElevatorListScreen";
import { ElevatorDetailScreen } from "@/screens/ElevatorDetailScreen";
import { ElevatorFormScreen } from "@/screens/ElevatorFormScreen";
import { CustomerListScreen } from "@/screens/CustomerListScreen";
import { CustomerFormScreen } from "@/screens/CustomerFormScreen";
import { CustomerDetailScreen } from "@/screens/CustomerDetailScreen";
import { ContactFormScreen } from "@/screens/ContactFormScreen";
import { ComplexListScreen } from "@/screens/ComplexListScreen";
import { BuildingListScreen } from "@/screens/BuildingListScreen";
import { BuildingFormScreen } from "@/screens/BuildingFormScreen";
import { ContractListScreen } from "@/screens/ContractListScreen";
import { ContractDetailScreen } from "@/screens/ContractDetailScreen";
import { ContractFormScreen } from "@/screens/ContractFormScreen";
import { UserListScreen } from "@/screens/UserListScreen";
import { AuditLogListScreen } from "@/screens/AuditLogListScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { QrLabelScreen } from "@/screens/QrLabelScreen";
import { StyleGuide } from "@/styleguide/StyleGuide";
import { RegisterScreen } from "@/screens/RegisterScreen";
import {
  PasswordResetConfirmScreen,
  PasswordResetRequestScreen,
} from "@/screens/PasswordResetScreen";
import { InvitationScreen, VerifyEmailScreen } from "@/screens/InvitationScreen";

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
  // Before the loaders, not inside the components. A component-level redirect
  // fires after the loader has already made the request a signed-out visitor
  // should never have made — which is exactly the storm this fixes.
  beforeLoad: async () => {
    if (sessionOverride) return;
    if (await ensureSession()) return;
    throw redirect({ to: "/login" });
  },
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
  // Arriving at a sign-in form while signed in is a small confusion with an
  // obvious answer.
  beforeLoad: async () => {
    if (sessionOverride) return;
    if (await ensureSession()) throw redirect({ to: "/elevators" });
  },
  component: LoginScreen,
});

/** Reachable with no session — these are how a person gets one. */
function publicRoute(path: string, component: () => React.ReactNode, loader?: Loader) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component,
    loader: loader ? (context) => loader(context).catch(() => undefined) : undefined,
  });
}

const styleguideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/styleguide",
  component: StyleGuide,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  styleguideRoute,
  publicRoute("/register", RegisterScreen),
  publicRoute("/password-reset", PasswordResetRequestScreen),
  publicRoute("/password-reset/$token", PasswordResetConfirmScreen),
  // The three paths the e-mails point at. Until these existed an invitation
  // arrived, the person clicked, and the product answered with a 404.
  publicRoute("/verify-email/$token", VerifyEmailScreen),
  publicRoute("/invitation/$token", InvitationScreen, ({ params }) =>
    // Prefetched so the page arrives naming the firm that sent it. Somebody
    // deciding whether to trust a link asking for a password should not be
    // looking at a skeleton while they decide.
    queryClient.ensureQueryData(invitationPreviewQuery(params.token)),
  ),
  shellRoute.addChildren([
    shellChild("/elevators", ElevatorListScreen, () =>
      queryClient.ensureQueryData(elevatorListQuery({ page: 1, page_size: 25 })),
    ),
    shellChild("/elevators/$id", ElevatorDetailScreen, async ({ params }) => {
      const id = params.id;
      // The history is not prefetched: only owners and admins may read it, and
      // the route has no session to check. The component asks for it when the
      // role allows, which costs one request after paint on two roles out of
      // five rather than a guaranteed 403 on the other three.
      await Promise.all([
        queryClient.ensureQueryData(elevatorQuery(id)),
        queryClient.ensureQueryData(elevatorAttachmentsQuery(id)),
      ]);
    }),
    shellChild("/elevators/new", ElevatorFormScreen),
    shellChild("/elevators/$id/edit", ElevatorFormScreen, ({ params }) =>
      queryClient.ensureQueryData(elevatorQuery(params.id)),
    ),
    shellChild("/customers/new", CustomerFormScreen),
    shellChild("/customers/$id/edit", CustomerFormScreen, ({ params }) =>
      queryClient.ensureQueryData(customerQuery(params.id)),
    ),
    // Both contact routes hang off the customer, and both load it: the create
    // form needs its name for the breadcrumb, and the edit form finds the
    // contact in the record rather than fetching it a second time.
    shellChild("/customers/$id/contacts/new", ContactFormScreen, ({ params }) =>
      queryClient.ensureQueryData(customerQuery(params.id)),
    ),
    shellChild("/customers/$id/contacts/$contactId", ContactFormScreen, ({ params }) =>
      queryClient.ensureQueryData(customerQuery(params.id)),
    ),
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
    shellChild("/buildings", BuildingListScreen, () =>
      queryClient.ensureQueryData(buildingListQuery({ page: 1, page_size: 25 })),
    ),
    shellChild("/buildings/$id/edit", BuildingFormScreen, ({ params }) =>
      queryClient.ensureQueryData(buildingQuery(params.id)),
    ),
    shellChild("/buildings/new", BuildingFormScreen),
    shellChild("/contracts", ContractListScreen, () =>
      queryClient.ensureQueryData(contractListQuery({ page: 1, page_size: 25 })),
    ),
    shellChild("/contracts/new", ContractFormScreen),
    shellChild("/contracts/$id/edit", ContractFormScreen, ({ params }) =>
      queryClient.ensureQueryData(contractQuery(params.id)),
    ),
    shellChild("/contracts/$id", ContractDetailScreen, ({ params }) =>
      queryClient.ensureQueryData(contractQuery(params.id)),
    ),
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
