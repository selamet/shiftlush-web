import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { plannedVisitListQuery } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { toDisplay } from "@/lib/date";
import { elevatorPlanParams } from "@/lib/plan";
import { PlanStatusChip } from "@/components/ui/status-chip";
import { PlanRowFlags } from "@/components/plan/PlanRowFlags";

/**
 * This month's plan for one lift: when it is due, who has it, where it stands.
 *
 * Fetched here rather than handed down, unlike the record itself, because the
 * desktop rail and the phone view both draw it and ask with the same key — one
 * request either way. A lift with no row this month says so: it is either not
 * under contract or the plan has not been written yet, and a missing card would
 * leave the reader to guess which question to ask.
 *
 * A technician sees the row only when it is theirs or still unassigned — the
 * server narrows that — so "no row" means "not yours" for them too.
 */
export function ElevatorPlanCard({ elevatorId, enabled }: { elevatorId: string; enabled: boolean }) {
  const { t } = useTranslation();
  const query = useQuery({
    ...plannedVisitListQuery(elevatorPlanParams(elevatorId)),
    enabled: enabled && Boolean(elevatorId),
  });

  if (!enabled) return null;
  if (query.isPending) return <p className="text-help text-subtle">{t("common.loading")}</p>;
  if (query.isError) return <p className="text-help text-destructive">{errorMessage(query.error, t)}</p>;

  const row = query.data.results[0];
  if (!row) return <p className="text-help text-subtle">{t("plan.noRowThisMonth")}</p>;

  const facts: Array<[string, React.ReactNode]> = [
    [t("plan.fields.dueDate"), <span className="tnum">{toDisplay(row.due_date)}</span>],
    [
      t("plan.fields.plannedDate"),
      row.planned_date ? <span className="tnum">{toDisplay(row.planned_date)}</span> : "—",
    ],
    [t("plan.fields.technician"), row.technician_name || t("plan.unassigned")],
    [t("plan.fields.status"), <PlanStatusChip value={row.status} />],
  ];

  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col">
        {facts.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-1.5 last:border-0"
          >
            <dt className="text-help text-muted-foreground">{label}</dt>
            <dd className="text-right text-cell">{value}</dd>
          </div>
        ))}
      </dl>
      <PlanRowFlags row={row} />
    </div>
  );
}
