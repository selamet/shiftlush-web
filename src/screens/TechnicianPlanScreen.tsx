import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronRight, MapPin, Navigation } from "lucide-react";
import { plannedVisitListQuery, routeQuery, type PlannedVisit, type RouteStop } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { toDisplay, todayIso } from "@/lib/date";
import { directionsUrl, routeKm } from "@/lib/route";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  canManagePlan,
  isDueThisWeek,
  myPlanParams,
  periodsForWeek,
} from "@/lib/plan";
import { ListError, TableSkeleton } from "@/components/list/ListStates";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { TechnicianTabs } from "@/components/plan/TechnicianTabs";
import { PlanStatusChip } from "@/components/ui/status-chip";
import { PlanRowFlags } from "@/components/plan/PlanRowFlags";

type Scope = "today" | "week";

/**
 * Route order across two months.
 *
 * Within a month the server already sends route order. A week that crosses a
 * month end is two requests, and two route-ordered lists placed end to end are
 * not one: the second month's first district would follow the first month's
 * last. So the merged list is ordered again here by the same keys the server
 * uses — district, neighbourhood, building, lift — and a sort that is stable
 * keeps the server's own order wherever these agree.
 */
function routeOrder(a: PlannedVisit, b: PlannedVisit): number {
  const keys: Array<keyof PlannedVisit> = [
    "district_name",
    "neighborhood_name",
    "building_name",
    "elevator_name",
  ];
  for (const key of keys) {
    const left = String(a[key] ?? "");
    const right = String(b[key] ?? "");
    const order = left.localeCompare(right, "tr");
    if (order !== 0) return order;
  }
  return 0;
}

/**
 * The technician's day, and their week.
 *
 * What they open the app for: which lifts, in the order they will drive to
 * them. Each row is one large target that opens the lift, where recording the
 * visit is the button at the bottom of the screen. Done rows stay on the list,
 * marked, because seeing what is already finished is half of knowing what is
 * left.
 *
 * Only their own rows — `technician=me` — and not the unassigned ones the
 * server would also let them see: an unassigned lift is the office's decision
 * to make, and putting it on a technician's day would make it for them.
 */
export function TechnicianPlanScreen({ scope }: { scope: Scope }) {
  const { t } = useTranslation();
  const { role } = useSession();
  const today = todayIso();
  const isTechnician = role === "technician";
  const periods = periodsForWeek(today);

  // Today is the server's suggested route: its stops already in driving
  // order, with positions, and the same "due today" rule as before — but over
  // every month, so last month's undone visit is not left off. The week is
  // still the month lists, in address order.
  const route = useQuery({
    ...routeQuery({ technician: "me", date: today }),
    enabled: isTechnician && scope === "today",
  });
  const lists = useQueries({
    queries: periods.map((period) => ({
      ...plannedVisitListQuery(myPlanParams(period)),
      enabled: isTechnician && scope === "week",
    })),
  });
  const queries = scope === "today" ? [route] : lists;

  if (!isTechnician) {
    // The office has the month view; anybody else has neither.
    if (canManagePlan(role)) {
      return (
        <div className="flex flex-col gap-3 px-6 py-16 text-center">
          <CalendarCheck className="size-8 self-center text-subtle" aria-hidden="true" />
          <p className="text-body text-muted-foreground">{t("plan.technicianOnly")}</p>
          <Link to="/plan" className="self-center text-body text-primary hover:underline">
            {t("plan.goToPlan")}
          </Link>
        </div>
      );
    }
    return <PlanRestricted titleKey="plan.restricted" />;
  }

  const failed = queries.find((query) => query.isError);
  const pending = queries.some((query) => query.isPending);
  let rows: Array<PlannedVisit | RouteStop>;
  if (scope === "today") {
    rows = route.data?.stops ?? [];
  } else {
    const all = lists.flatMap((query) => query.data?.results ?? []);
    const merged = periods.length > 1 ? [...all].sort(routeOrder) : all;
    rows = merged.filter((row) => isDueThisWeek(row, today));
  }
  const left = rows.filter((row) => row.status === "planned").length;
  const unplaced = new Set(scope === "today" ? (route.data?.unplaced ?? []) : []);
  const km = scope === "today" && route.data ? routeKm(route.data.total_km) : "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{scope === "today" ? t("plan.today") : t("plan.week")}</h1>
        <p className="text-help text-muted-foreground">
          {scope === "today" ? toDisplay(today) : t("plan.weekHint")}
          {!pending && !failed && ` · ${t("plan.leftCount", { count: left })}`}
        </p>
        {km && (
          <p className="flex items-center gap-1.5 text-help text-muted-foreground">
            <Navigation className="size-3.5 shrink-0" aria-hidden="true" />
            {t("plan.route.suggested", { km })}
          </p>
        )}
      </div>

      <TechnicianTabs active={scope} />

      {pending ? (
        <TableSkeleton columns={1} rows={4} />
      ) : failed ? (
        <ListError
          message={errorMessage(failed.error, t)}
          reference={supportReference(failed.error)}
          onRetry={() => queries.forEach((query) => void query.refetch())}
        />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <CalendarCheck className="size-8 text-subtle" aria-hidden="true" />
          <p className="text-body text-muted-foreground">
            {scope === "today" ? t("plan.todayEmpty") : t("plan.weekEmpty")}
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.id} className="flex flex-col gap-1">
              {/* Stops the route could not place follow the rest, under a
                  heading that says why they are where they are. */}
              {unplaced.has(row.id) && (index === 0 || !unplaced.has(rows[index - 1].id)) && (
                <h2 className="mt-2 text-label text-muted-foreground">{t("plan.route.unplaced")}</h2>
              )}
              <Link
                to="/elevators/$id"
                params={{ id: row.elevator }}
                className={cn(
                  "flex min-h-control-xl items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted focus-ring",
                  row.is_overdue ? "border-l-[3px] border-l-foreground" : "border-border-subtle",
                  row.status !== "planned" && "opacity-75",
                )}
              >
                {/* The stop number: the order is the route, and "the third
                    one" is how the day is talked about over the phone. */}
                <span className="tnum grid size-8 shrink-0 place-items-center rounded-full bg-muted text-label">
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                  <span className="text-cardtitle">{row.elevator_name}</span>
                  <span className="flex items-center gap-1 text-help text-muted-foreground">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {[row.building_name, row.neighborhood_name, row.district_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
                    <span className="tnum">
                      {row.planned_date
                        ? t("plan.plannedOn", { date: toDisplay(row.planned_date) })
                        : t("plan.dueOn", { date: toDisplay(row.due_date) })}
                    </span>
                    <PlanStatusChip value={row.status} />
                    <PlanRowFlags row={row} />
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden="true" />
              </Link>
              {"latitude" in row && directionsUrl(row.latitude, row.longitude) && (
                // Beside the row, not inside it: the row opens the lift, and
                // a link inside a link is two targets under one thumb.
                <a
                  href={directionsUrl(row.latitude, row.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("plan.route.directionsTo", { lift: row.elevator_name })}
                  className="inline-flex items-center gap-1.5 self-end px-2 py-1 text-help text-primary hover:underline focus-ring"
                >
                  <Navigation className="size-3.5" aria-hidden="true" />
                  {t("plan.route.directions")}
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function TodayScreen() {
  return <TechnicianPlanScreen scope="today" />;
}

export function WeekScreen() {
  return <TechnicianPlanScreen scope="week" />;
}
