import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, UserPlus } from "lucide-react";
import {
  MAX_PAGE_SIZE,
  bulkAssignPlannedVisits,
  planKeys,
  planSummaryQuery,
  plannedVisitListQuery,
  updatePlannedVisit,
  visitTechniciansQuery,
  type PlanSummary,
  type PlannedVisit,
  type TechnicianOption,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { endOfMonth, monthYearLabel, toDisplay, todayIso } from "@/lib/date";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useListSearch, type ListState } from "@/lib/list-search";
import {
  canManagePlan,
  nextPeriod,
  overdueFilter,
  previousPeriod,
  triedNotDone,
} from "@/lib/plan";
import { currentPeriod, planFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn, type ListSelection } from "@/components/list/ListPage";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { PlanFlagChips, PlanStatusChip } from "@/components/ui/status-chip";

/** One row being edited in place: the technician ("" for nobody) and the day ("" for none). */
interface Editing {
  id: string;
  technician: string;
  plannedDate: string;
}

const selectClass =
  "h-control-sm rounded-md border border-input bg-card px-2 text-body focus-ring pointer-coarse:h-control-md";

/**
 * The month's maintenance plan, for the office.
 *
 * One row per lift, in route order — district, neighbourhood, building, lift —
 * because that is the order a technician drives them in, and the office plans
 * in the order the work will happen. The rows that need a decision stand out:
 * the ones nobody has been given (a filter and a link in the header), the ones
 * past their due day, and the ones somebody tried and could not finish.
 *
 * Nothing is created or deleted here; the server's planning job writes the
 * rows and a recorded visit closes them. What the office does is assign and
 * reschedule, a row at a time in place or many at once.
 */
export function PlanScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const allowed = canManagePlan(role);
  const list = useListSearch(filters);
  const queryClient = useQueryClient();

  const period = list.filters.period ?? currentPeriod();
  const params = { ...list.params, period };

  const query = useQuery({ ...plannedVisitListQuery(params), enabled: allowed });
  // The header describes the whole month whatever the table is narrowed to:
  // it is where the narrowing is chosen from.
  const summary = useQuery({ ...planSummaryQuery({ period }), enabled: allowed });
  const technicians = useQuery({ ...visitTechniciansQuery(), enabled: allowed });
  // The month's districts, for the district menu. The plan has no district
  // endpoint and the address cascade needs a province first, so the menu is
  // built from the month's own rows — one page of the largest size the server
  // serves. A firm planning more lifts than that in one month may find a
  // district missing from the menu; the filter itself is still the server's.
  const wholeMonth = useQuery({
    ...plannedVisitListQuery({ period, page_size: MAX_PAGE_SIZE }),
    enabled: allowed,
  });

  const [editing, setEditing] = useState<Editing | null>(null);
  const save = useMutation({
    mutationFn: (edit: Editing) =>
      updatePlannedVisit(edit.id, {
        technician: edit.technician || null,
        planned_date: edit.plannedDate || null,
      }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });

  if (!allowed) return <PlanRestricted titleKey="plan.restricted" />;

  const technicianList = technicians.data ?? [];
  const districts = new Map<number, string>();
  for (const row of wholeMonth.data?.results ?? []) {
    if (row.district !== null && row.district_name) districts.set(row.district, row.district_name);
  }

  const barFilters = filters.map((filter) => {
    if (filter.param === "technician") {
      return {
        ...filter,
        options: technicianList.map((technician) => ({
          value: technician.id,
          labelKey: "plan.fields.technician",
          label: technician.name,
        })),
      };
    }
    if (filter.param === "district") {
      return {
        ...filter,
        options: [...districts].map(([id, name]) => ({
          value: String(id),
          labelKey: "plan.fields.district",
          label: name,
        })),
      };
    }
    return filter;
  });

  const rows = query.data?.results ?? [];
  // The planned day has to fall inside the row's month; the picker greys the
  // rest out as a hint, and the server decides.
  const monthStart = `${period}-01`;
  const monthEnd = endOfMonth(monthStart);

  function startEdit(row: PlannedVisit) {
    save.reset();
    setEditing({ id: row.id, technician: row.technician ?? "", plannedDate: row.planned_date ?? "" });
  }

  const columns: ListColumn<PlannedVisit>[] = [
    {
      key: "plan.fields.elevator",
      sticky: true,
      cell: (row) => (
        <Link to="/elevators/$id" params={{ id: row.elevator }} className="hover:underline">
          <Stacked
            primary={row.elevator_name}
            secondary={[row.building_name, row.neighborhood_name].filter(Boolean).join(" · ")}
          />
        </Link>
      ),
    },
    {
      key: "plan.fields.district",
      hideOnMobile: true,
      cell: (row) => row.district_name || <span className="text-subtle">—</span>,
    },
    {
      key: "plan.fields.customer",
      hideOnMobile: true,
      cell: (row) => row.customer_name,
    },
    {
      key: "plan.fields.dueDate",
      cell: (row) => <span className="tnum whitespace-nowrap">{toDisplay(row.due_date)}</span>,
    },
    {
      key: "plan.fields.plannedDate",
      cell: (row) =>
        editing?.id === row.id ? (
          <>
            <label htmlFor={`plan-date-${row.id}`} className="sr-only">
              {t("plan.fields.plannedDate")}
            </label>
            <DatePicker
              id={`plan-date-${row.id}`}
              value={editing.plannedDate}
              min={monthStart}
              max={monthEnd}
              onChange={(iso) => setEditing({ ...editing, plannedDate: iso })}
              className="w-40"
            />
          </>
        ) : row.planned_date ? (
          <span className="tnum whitespace-nowrap">{toDisplay(row.planned_date)}</span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: "plan.fields.technician",
      cell: (row) =>
        editing?.id === row.id ? (
          <>
            <label htmlFor={`plan-tech-${row.id}`} className="sr-only">
              {t("plan.fields.technician")}
            </label>
            <select
              id={`plan-tech-${row.id}`}
              value={editing.technician}
              onChange={(event) => setEditing({ ...editing, technician: event.target.value })}
              className={selectClass}
            >
              <option value="">{t("plan.unassigned")}</option>
              {technicianList.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name}
                </option>
              ))}
            </select>
          </>
        ) : row.technician_name ? (
          row.technician_name
        ) : (
          // A word, not a blank: an empty cell reads as "not loaded", and the
          // unassigned rows are the ones the office is looking for.
          <span className="text-help font-medium text-muted-foreground">
            {t("plan.unassigned")}
          </span>
        ),
    },
    {
      key: "plan.fields.status",
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <PlanStatusChip value={row.status} />
          <PlanFlagChips
            overdue={row.is_overdue}
            tried={triedNotDone(row)}
            overdueLabel={t("plan.flags.overdue")}
            triedLabel={t("plan.flags.tried", {
              status: enumLabel("visit.status", row.latest_visit_status),
            })}
          />
        </span>
      ),
    },
    {
      key: "common.actions",
      cell: (row) =>
        editing?.id === row.id ? (
          <span className="flex flex-col items-start gap-1">
            <span className="flex items-center gap-2">
              <Button size="xs" disabled={save.isPending} onClick={() => save.mutate(editing)}>
                {save.isPending ? t("common.saving") : t("common.save")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
            </span>
            {save.isError && (
              <span className="text-help text-destructive">{errorMessage(save.error, t)}</span>
            )}
          </span>
        ) : (
          // Done and cancelled rows are history; there is nothing to plan.
          row.status === "planned" && (
            <Button
              size="xs"
              variant="ghost"
              aria-label={t("plan.editRow", { name: row.elevator_name })}
              onClick={() => startEdit(row)}
            >
              <Pencil aria-hidden="true" />
              {t("common.edit")}
            </Button>
          )
        ),
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="plan.title"
      state={list}
      filters={barFilters}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      total={query.data?.pagination.total ?? 0}
      loading={query.isPending}
      selectable
      bulkActions={(selection) => (
        <BulkAssign selection={selection} period={period} technicians={technicianList} />
      )}
      error={
        query.isError
          ? {
              message: errorMessage(query.error, t),
              reference: supportReference(query.error),
              onRetry: () => void query.refetch(),
            }
          : undefined
      }
      emptyTitleKey="plan.empty"
      headerExtra={
        <div className="flex flex-col gap-4">
          <MonthPicker period={period} list={list} />
          <SummaryHeader summary={summary.data} list={list} />
        </div>
      }
    />
  );
}

/**
 * The month on screen. This month and the next are the ones anybody plans,
 * with the one before for the stragglers; a period arriving on a link that is
 * none of the three is offered as well, so the control never misstates it.
 */
function MonthPicker({ period, list }: { period: string; list: ListState }) {
  const { t } = useTranslation();
  const current = currentPeriod();
  const choices = [previousPeriod(current), current, nextPeriod(current)];
  if (!choices.includes(period)) choices.push(period);

  return (
    <label className="flex flex-wrap items-center gap-2">
      <span className="text-label">{t("plan.fields.period")}</span>
      <select
        value={period}
        // The current month is the default and is never written into the URL.
        onChange={(event) =>
          list.setFilter("period", event.target.value === current ? null : event.target.value)
        }
        className={selectClass}
      >
        {choices.map((value) => (
          <option key={value} value={value}>
            {monthYearLabel(`${value}-01`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The month at a glance: how much is done, what nobody has, what is late, and
 * the same per technician. Each count that names a problem is also the way to
 * it — the link narrows the table to exactly those rows.
 */
function SummaryHeader({ summary, list }: { summary?: PlanSummary; list: ListState }) {
  const { t } = useTranslation();
  if (!summary) return null;

  const showUnassigned = () => {
    list.setFilter("unassigned", "true");
  };
  const showOverdue = () => {
    list.setFilters(overdueFilter(todayIso()));
  };

  const tiles: Array<{ label: string; value: number; onSelect?: () => void; warn?: boolean }> = [
    { label: t("plan.summary.total"), value: summary.total },
    { label: t("plan.summary.done"), value: summary.by_status.done },
    {
      label: t("plan.summary.unassigned"),
      value: summary.unassigned,
      onSelect: summary.unassigned > 0 ? showUnassigned : undefined,
      warn: summary.unassigned > 0,
    },
    {
      label: t("plan.summary.overdue"),
      value: summary.overdue,
      onSelect: summary.overdue > 0 ? showOverdue : undefined,
      warn: summary.overdue > 0,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => {
          const body = (
            <>
              <span className="text-help text-muted-foreground">{tile.label}</span>
              <span className="tnum text-title">{tile.value}</span>
              {tile.onSelect && (
                <span className="text-help text-primary">{t("plan.summary.show")}</span>
              )}
            </>
          );
          const className = `flex flex-col items-start gap-0.5 rounded-lg border bg-card p-3 text-left ${
            tile.warn ? "border-warning border-l-[3px]" : "border-border-subtle"
          }`;
          return tile.onSelect ? (
            <button
              key={tile.label}
              type="button"
              onClick={tile.onSelect}
              className={`${className} hover:bg-muted focus-ring`}
            >
              {body}
            </button>
          ) : (
            <div key={tile.label} className={className}>
              {body}
            </div>
          );
        })}
      </div>

      {summary.technicians.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border-subtle bg-card">
          <table className="w-full text-cell">
            <thead className="border-b border-border bg-background text-colhead uppercase text-subtle">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("plan.fields.technician")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("plan.summary.planned")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("plan.summary.done")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("plan.summary.overdue")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.technicians.map((entry) => (
                <tr key={entry.technician} className="border-b border-border-subtle last:border-0">
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => list.setFilter("technician", entry.technician)}
                      className="text-left text-primary hover:underline focus-ring"
                    >
                      {entry.technician_name}
                    </button>
                  </td>
                  <td className="tnum px-3 py-1.5 text-right">{entry.planned}</td>
                  <td className="tnum px-3 py-1.5 text-right">{entry.done}</td>
                  <td
                    className={`tnum px-3 py-1.5 text-right ${entry.overdue > 0 ? "font-semibold text-warning" : ""}`}
                  >
                    {entry.overdue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Giving the selected rows to one technician.
 *
 * The server's bulk endpoint takes ids and is all or nothing. Rows ticked on
 * the page are already ids; "everything matching the filter" is read back as
 * ids at the moment of pressing, fresh, and refused when the match is larger
 * than one page can carry — acting on the part that came back would assign a
 * fraction and report it as the whole.
 */
function BulkAssign({
  selection,
  period,
  technicians,
}: {
  selection: ListSelection;
  period: string;
  technicians: TechnicianOption[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [technician, setTechnician] = useState("");

  const assign = useMutation({
    mutationFn: async () => {
      let ids: string[];
      if (selection.mode === "rows") {
        ids = selection.ids;
      } else {
        const page = await queryClient.fetchQuery({
          ...plannedVisitListQuery({
            ...selection.params,
            period,
            page: 1,
            page_size: MAX_PAGE_SIZE,
          }),
          staleTime: 0,
        });
        if (page.pagination.total > page.results.length) {
          throw new TooMany(page.pagination.total);
        }
        ids = page.results.map((row) => row.id);
      }
      return bulkAssignPlannedVisits(ids, technician);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });

  const failure =
    assign.error instanceof TooMany
      ? t("bulk.tooManyToEnumerate", { count: assign.error.count, max: MAX_PAGE_SIZE })
      : assign.error
        ? errorMessage(assign.error, t)
        : "";

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="plan-bulk-technician">
        {t("plan.fields.technician")}
      </label>
      <select
        id="plan-bulk-technician"
        value={technician}
        onChange={(event) => {
          setTechnician(event.target.value);
          assign.reset();
        }}
        className={selectClass}
      >
        <option value="">{t("plan.selectTechnician")}</option>
        {technicians.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={!technician || assign.isPending}
        onClick={() => assign.mutate()}
      >
        <UserPlus aria-hidden="true" />
        {assign.isPending ? t("plan.assigning") : t("plan.assign")}
      </Button>
      {assign.isSuccess && (
        <span role="status" className="text-help text-success">
          {t("plan.assigned", { count: assign.data.count })}
        </span>
      )}
      {failure && (
        <Alert tone="error" className="py-1">
          {failure}
        </Alert>
      )}
    </span>
  );
}

/** The filtered set is larger than one page; nothing was sent. */
class TooMany extends Error {
  constructor(readonly count: number) {
    super("too many to enumerate");
  }
}
