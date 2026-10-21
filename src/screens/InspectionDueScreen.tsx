import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, ShieldAlert } from "lucide-react";
import { inspectionDueQuery, type InspectionDueItem } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { toDisplay } from "@/lib/date";
import { useSession } from "@/lib/session";
import { useListSearch } from "@/lib/list-search";
import { DUE_WINDOWS, atSealingRisk, canReadInspections } from "@/lib/inspections";
import { cn } from "@/lib/utils";
import { inspectionDueDays, inspectionDueFilters as filters } from "@/screens/list-searches";
import { ListError, TableSkeleton } from "@/components/list/ListStates";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { InspectionLabel } from "@/components/ui/inspection-label";
import { Segmented } from "@/components/ui/segmented";
import { StatusChip } from "@/components/ui/status-chip";

/**
 * What the firm has coming up with the inspectorate.
 *
 * Two lists, in the order of what they cost to miss. Correction deadlines
 * first: a yellow or red label whose defects are not fixed in time ends with
 * the municipality sealing the lift, and a deadline already passed is said as
 * exactly that — "sealing risk" — with an icon and the heaviest weight,
 * never left to a colour. Then the periodic inspections falling due, so the
 * appointment is booked before the date rather than after it.
 *
 * The labels use the inspection label component, whose colours are the
 * inspectorate's and deliberately apart from the product's own status colours.
 * Technicians may read it, narrowed by the server to their customers.
 */
export function InspectionDueScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const allowed = canReadInspections(role);
  const list = useListSearch(filters);
  const days = inspectionDueDays(list.filters);

  const query = useQuery({ ...inspectionDueQuery(days), enabled: allowed });

  if (!allowed) return <PlanRestricted titleKey="inspection.restricted" />;

  const rows = query.data ?? [];
  const corrections = rows.filter((row) => row.type === "correction");
  const inspections = rows.filter((row) => row.type === "inspection");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title">{t("inspection.title")}</h1>
          <p className="text-help text-muted-foreground">{t("inspection.intro")}</p>
        </div>
        <Segmented
          name="inspection-window"
          label={t("inspection.window")}
          className="w-full max-w-xs"
          options={DUE_WINDOWS.map((value) => ({
            value: String(value),
            label: t("inspection.windowDays", { count: value }),
          }))}
          value={String(days)}
          // 60 is the server's default and is never written into the URL.
          onChange={(value) => list.setFilter("days", value === "60" ? null : value)}
        />
      </div>

      {query.isPending ? (
        <TableSkeleton columns={1} rows={5} />
      ) : query.isError ? (
        <ListError
          message={errorMessage(query.error, t)}
          reference={supportReference(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <DueSection
            title={t("inspection.corrections")}
            empty={t("inspection.correctionsEmpty")}
            rows={corrections}
          />
          <DueSection
            title={t("inspection.upcoming")}
            empty={t("inspection.upcomingEmpty", { count: days })}
            rows={inspections}
          />
        </>
      )}
    </div>
  );
}

function DueSection({ title, empty, rows }: { title: string; empty: string; rows: InspectionDueItem[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-cardtitle">
        {title} <span className="tnum text-help font-normal text-muted-foreground">({rows.length})</span>
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-help text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-card">
          {rows.map((row) => (
            <DueRow key={`${row.type}-${row.elevator}-${row.date}`} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DueRow({ row }: { row: InspectionDueItem }) {
  const { t } = useTranslation();
  const risk = atSealingRisk(row);
  const overdue = row.days_left < 0;

  return (
    <li className={cn(risk && "border-l-[3px] border-l-foreground")}>
      <Link
        to="/elevators/$id"
        params={{ id: row.elevator }}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted focus-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-cell font-medium">{row.elevator_name}</span>
          <span className="truncate text-help text-muted-foreground">
            {row.building_name} · {row.customer_name}
          </span>
        </span>
        <InspectionLabel value={row.label} />
        <span className="flex flex-col items-end leading-tight">
          <span className="tnum text-cell">{toDisplay(row.date)}</span>
          <span className={cn("tnum text-help", overdue ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {overdue
              ? t("inspection.daysPassed", { count: -row.days_left })
              : row.days_left === 0
                ? t("inspection.today")
                : t("inspection.daysLeft", { count: row.days_left })}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {row.type === "correction" && row.open_nonconformities > 0 && (
            <StatusChip weight="outline" icon={ClipboardList}>
              {t("inspection.openCount", { count: row.open_nonconformities })}
            </StatusChip>
          )}
          {risk ? (
            <StatusChip weight="ink" icon={ShieldAlert}>
              {t("inspection.sealingRisk")}
            </StatusChip>
          ) : row.type === "correction" && row.sealed_if_missed ? (
            <StatusChip weight="outline">{t("inspection.sealedIfMissed")}</StatusChip>
          ) : row.type === "inspection" && overdue ? (
            <StatusChip weight="ink">{t("inspection.inspectionOverdue")}</StatusChip>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
