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
  complexListQuery,
  complexQuery,
  contractListQuery,
  customerListQuery,
  customerQuery,
  elevatorAttachmentsQuery,
  elevatorByQrQuery,
  elevatorListQuery,
  elevatorQuery,
  invitationPreviewQuery,
  buildingQuery,
  contractQuery,
  userListQuery,
  userQuery,
  invitationListQuery,
  activeOwnerCountQuery,
  companyQuery,
  currentUserQuery,
  sessionListQuery,
} from "@/api/queries";
import { SessionProvider, ensureSession, type SessionOverride } from "@/lib/session";
import type { ListSearch } from "@/lib/list-search";
import type { Role } from "@/components/layout/nav-config";
import { LoginScreen } from "@/screens/LoginScreen";
import { ElevatorListScreen, elevatorListSearch } from "@/screens/ElevatorListScreen";
import { ElevatorDetailScreen } from "@/screens/ElevatorDetailScreen";
import { ElevatorFormScreen } from "@/screens/ElevatorFormScreen";
import { CustomerListScreen, customerListSearch } from "@/screens/CustomerListScreen";
import { CustomerFormScreen } from "@/screens/CustomerFormScreen";
import { CustomerDetailScreen } from "@/screens/CustomerDetailScreen";
import { ContactFormScreen } from "@/screens/ContactFormScreen";
import { ComplexListScreen, complexListSearch } from "@/screens/ComplexListScreen";
import { ComplexFormScreen } from "@/screens/ComplexFormScreen";
import { ComplexDetailScreen } from "@/screens/ComplexDetailScreen";
import { BuildingListScreen, buildingListSearch } from "@/screens/BuildingListScreen";
import { BuildingFormScreen } from "@/screens/BuildingFormScreen";
import { ContractListScreen, contractListSearch } from "@/screens/ContractListScreen";
import { ContractDetailScreen } from "@/screens/ContractDetailScreen";
import { ContractFormScreen } from "@/screens/ContractFormScreen";
import { UserListScreen, userListSearch } from "@/screens/UserListScreen";
import { InviteUserScreen } from "@/screens/InviteUserScreen";
import { UserDetailScreen } from "@/screens/UserDetailScreen";
import { AuditLogListScreen, auditLogListSearch } from "@/screens/AuditLogListScreen";
import { ProfileSettingsScreen, SettingsScreen } from "@/screens/SettingsScreen";
import { QrLabelScreen } from "@/screens/QrLabelScreen";
import { ScanScreen } from "@/screens/ScanScreen";
import { QrResolveScreen } from "@/screens/QrResolveScreen";
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

interface LoaderContext {
  params: Record<string, string>;
  /** The route's validated search, when it declares one. */
  deps: { search: ListSearch };
}

type Loader = (context: LoaderContext) => Promise<unknown>;

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
 *
 * `validateSearch` is where a list route's filter, search and paging
 * parameters are typed and narrowed to what its endpoint accepts (spec 13).
 * The loader is keyed on that search through `loaderDeps`, so a link carrying
 * a filter prefetches the list it names rather than warming page one and then
 * fetching what was actually asked for.
 */
/**
 * A list, plus the count of the record it depends on when the list is empty.
 *
 * The empty state offers one of two things — "create the first one" or "you
 * need a customer first" — and which one is right depends on a fact neither the
 * list nor the route knows. Fetching it here rather than in the screen means the
 * answer is in the cache before the first paint, instead of the empty state
 * showing nothing for a beat and then deciding.
 *
 * Only asked when the list came back empty, and only ever one row: the count is
 * the whole answer.
 */
async function listAndParentCount(
  list: Promise<{ pagination: { total: number } }>,
  parent: () => Promise<unknown>,
) {
  const page = await list;
  if (page.pagination.total === 0) await parent();
}

function shellChild(
  path: string,
  component: () => React.ReactNode,
  loader?: Loader,
  validateSearch?: (raw: Record<string, unknown>) => ListSearch,
) {
  return createRoute({
    getParentRoute: () => shellRoute,
    path,
    component,
    validateSearch,
    loaderDeps: validateSearch ? ({ search }: { search: ListSearch }) => ({ search }) : undefined,
    loader: loader
      ? (context) => loader(context as unknown as LoaderContext).catch(() => undefined)
      : undefined,
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
    loader: loader
      ? (context) => loader(context as unknown as LoaderContext).catch(() => undefined)
      : undefined,
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
    shellChild(
      "/elevators",
      ElevatorListScreen,
      ({ deps }) =>
        listAndParentCount(
          queryClient.ensureQueryData(elevatorListQuery(elevatorListSearch.params(deps.search))),
          () => queryClient.ensureQueryData(buildingListQuery({ page_size: 1 })),
        ),
      elevatorListSearch,
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
    shellChild(
      "/customers",
      CustomerListScreen,
      ({ deps }) =>
        queryClient.ensureQueryData(customerListQuery(customerListSearch.params(deps.search))),
      customerListSearch,
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
    shellChild("/complexes/new", ComplexFormScreen),
    shellChild("/complexes/$id/edit", ComplexFormScreen, ({ params }) =>
      queryClient.ensureQueryData(complexQuery(params.id)),
    ),
    shellChild(
      "/complexes",
      ComplexListScreen,
      ({ deps }) =>
        listAndParentCount(
          queryClient.ensureQueryData(complexListQuery(complexListSearch.params(deps.search))),
          () => queryClient.ensureQueryData(customerListQuery({ page_size: 1 })),
        ),
      complexListSearch,
    ),
    shellChild("/complexes/$id", ComplexDetailScreen, async ({ params }) => {
      const id = params.id;
      // The complex and the blocks inside it are one screen; fetching them in
      // sequence would make the page fill in two visible steps.
      await Promise.all([
        queryClient.ensureQueryData(complexQuery(id)),
        queryClient.ensureQueryData(buildingListQuery({ complex: id, page_size: 100 })),
      ]);
    }),
    shellChild(
      "/buildings",
      BuildingListScreen,
      ({ deps }) =>
        listAndParentCount(
          queryClient.ensureQueryData(buildingListQuery(buildingListSearch.params(deps.search))),
          () => queryClient.ensureQueryData(customerListQuery({ page_size: 1 })),
        ),
      buildingListSearch,
    ),
    shellChild("/buildings/$id/edit", BuildingFormScreen, ({ params }) =>
      queryClient.ensureQueryData(buildingQuery(params.id)),
    ),
    shellChild("/buildings/new", BuildingFormScreen),
    shellChild(
      "/contracts",
      ContractListScreen,
      ({ deps }) =>
        listAndParentCount(
          queryClient.ensureQueryData(contractListQuery(contractListSearch.params(deps.search))),
          () => queryClient.ensureQueryData(customerListQuery({ page_size: 1 })),
        ),
      contractListSearch,
    ),
    shellChild("/contracts/new", ContractFormScreen),
    shellChild("/contracts/$id/edit", ContractFormScreen, ({ params }) =>
      queryClient.ensureQueryData(contractQuery(params.id)),
    ),
    shellChild("/contracts/$id", ContractDetailScreen, ({ params }) =>
      queryClient.ensureQueryData(contractQuery(params.id)),
    ),
    shellChild("/qr-labels", QrLabelScreen),
    shellChild("/scan", ScanScreen),
    // The URL printed on every sticker (spec 11.2). It lives inside the shell
    // because resolving a token needs a session — the endpoint is scoped to the
    // signed-in user's firm, which is the whole reason another firm's token
    // answers 404 instead of handing over a record.
    //
    // Prefetched so the screen names the lift on its first paint. The response
    // is small by design, and it arriving ahead of the thirty-one-field record
    // is what makes the wait a confirmation rather than a spinner.
    shellChild("/q/$token", QrResolveScreen, ({ params }) =>
      queryClient.ensureQueryData(elevatorByQrQuery(params.token)),
    ),
    shellChild(
      "/users",
      UserListScreen,
      async ({ deps }) => {
        // Both halves of the page at once. The pending invitations are part of
        // this screen, not an afterthought: fetched after the table they would
        // appear a moment after the user had already decided it had finished
        // loading, which is how a section gets missed.
        await Promise.all([
          queryClient.ensureQueryData(userListQuery(userListSearch.params(deps.search))),
          queryClient.ensureQueryData(invitationListQuery()),
        ]);
      },
      userListSearch,
    ),
    // Declared before the dynamic sibling for readability; the router ranks a
    // static segment above a parameter either way.
    shellChild("/users/invite", InviteUserScreen),
    shellChild("/users/$id", UserDetailScreen, async ({ params }) => {
      const [user] = await Promise.all([
        queryClient.ensureQueryData(userQuery(params.id)),
        // The guard the screen consults before it offers to deactivate anyone.
        // Fetched with the record so the control does not appear and then
        // withdraw itself once the count arrives.
        queryClient.ensureQueryData(activeOwnerCountQuery()),
      ]);
      // Only a technician has assignments, and for them the panel is the point
      // of the page. The parameters match the ones the panel asks with, or the
      // prefetch would warm a key nothing reads.
      if (user.role === "technician") {
        await queryClient.ensureQueryData(customerListQuery({ page_size: 100, search: "" }));
      }
    }),
    shellChild("/audit-logs", AuditLogListScreen, undefined, auditLogListSearch),
    // The company record only. The signed-in user's own details belong to the
    // profile tab, which is a route of its own — prefetching them here would
    // mean a request on every visit for a panel most visits never open.
    //
    // Declared before the tab beneath it for readability; the router ranks the
    // static segment above nothing at all either way.
    shellChild("/settings", SettingsScreen, () => queryClient.ensureQueryData(companyQuery())),
    // The person, and the devices they are signed in on. Both at once: the
    // session list is the evidence that a password change did what it said,
    // and a list that arrives after the form has already been read is a list
    // nobody looks at twice.
    shellChild("/settings/profile", ProfileSettingsScreen, async () => {
      await Promise.all([
        queryClient.ensureQueryData(currentUserQuery()),
        queryClient.ensureQueryData(sessionListQuery()),
      ]);
    }),
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
    ? {
        role,
        fullName: "Test User",
        companyName: "Test Company",
        // Matches one fixture user and not the others, so a smoke render covers
        // both sides of every "is this me?" branch on the user screens.
        userId: "u2",
      }
    : undefined;
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
}
