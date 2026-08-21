import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/AppShell";
import { SessionProvider } from "@/lib/session";
import { LoginScreen } from "@/screens/LoginScreen";
import { ElevatorListScreen } from "@/screens/ElevatorListScreen";
import { ElevatorFormScreen } from "@/screens/ElevatorFormScreen";
import { ElevatorDetailScreen } from "@/screens/ElevatorDetailScreen";
import { ContractDetailScreen } from "@/screens/ContractDetailScreen";
import { QrLabelScreen } from "@/screens/QrLabelScreen";
import { AddressPicker } from "@/components/forms/AddressPicker";
import { StyleGuide } from "@/styleguide/StyleGuide";

const rootRoute = createRootRoute({
  component: () => (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  ),
});

/** Screens not yet built. Named so the gap is obvious in the nav, not hidden. */
function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 p-6">
      <h1 className="text-title">{t(titleKey)}</h1>
      <p className="text-body text-muted-foreground">{t("empty.noRecords")}</p>
    </div>
  );
}

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

const elevatorsRoute = shellChild("/elevators", ElevatorListScreen);
const elevatorDetailRoute = shellChild("/elevators/$id", ElevatorDetailScreen);
const elevatorEditRoute = shellChild("/elevators/$id/edit", ElevatorFormScreen);
const contractDetailRoute = shellChild("/contracts/$id", ContractDetailScreen);
const addressDemoRoute = shellChild("/buildings/new", () => (
  <div className="p-6">
    <AddressPicker />
  </div>
));
const customersRoute = shellChild("/customers", () => <Placeholder titleKey="customer.title" />);
const complexesRoute = shellChild("/complexes", () => <Placeholder titleKey="complex.title" />);
const buildingsRoute = shellChild("/buildings", () => <Placeholder titleKey="building.title" />);
const contractsRoute = shellChild("/contracts", () => <Placeholder titleKey="contract.title" />);
const qrLabelsRoute = shellChild("/qr-labels", QrLabelScreen);
const usersRoute = shellChild("/users", () => <Placeholder titleKey="user.title" />);
const auditLogsRoute = shellChild("/audit-logs", () => <Placeholder titleKey="nav.auditLogs" />);
const settingsRoute = shellChild("/settings", () => <Placeholder titleKey="company.title" />);

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  styleguideRoute,
  shellRoute.addChildren([
    elevatorsRoute,
    elevatorDetailRoute,
    elevatorEditRoute,
    contractDetailRoute,
    addressDemoRoute,
    customersRoute,
    complexesRoute,
    buildingsRoute,
    contractsRoute,
    qrLabelsRoute,
    usersRoute,
    auditLogsRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });
