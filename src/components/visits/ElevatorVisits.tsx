import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, TriangleAlert } from "lucide-react";
import { visitListQuery, type Elevator, type MaintenanceVisit } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { toDisplay } from "@/lib/date";
import { cn } from "@/lib/utils";
import { attentionCount, elevatorHistoryParams } from "@/lib/visit";
import { buttonVariants } from "@/components/ui/button";
import { VisitStatusChip } from "@/components/ui/status-chip";

/**
 * The elevator's recent visits.
 *
 * One hook because the desktop record and the phone view both show the panel
 * and must not disagree: same request, same cache entry, same answer. The
 * maintenance dates are not derived from these rows — the server keeps both on
 * the elevator itself and sends them with the record.
 */
export function useElevatorVisits(elevatorId: string, enabled: boolean) {
  const history = useQuery({
    ...visitListQuery(elevatorHistoryParams(elevatorId)),
    enabled: enabled && Boolean(elevatorId),
  });
  return { history, rows: history.data?.results ?? [] };
}

/**
 * The "record a visit" action, or the reason there is none.
 *
 * A visit is recorded against the contract that covers the lift, and the
 * server refuses one without it (`NO_ACTIVE_CONTRACT_FOR_ELEVATOR`). Offering
 * the button anyway would send a technician through sixteen rows and a photo
 * to be told at the end that none of it could be saved — so the reason is
 * stated where the button would have been.
 */
export function RecordVisitAction({
  elevator,
  size,
  className,
}: {
  elevator: Elevator;
  size: "sm" | "xl";
  className?: string;
}) {
  const { t } = useTranslation();

  if (!elevator.current_contract) {
    return (
      <p
        className={cn(
          "flex items-start gap-1.5 text-help text-muted-foreground",
          size === "xl" && "text-body",
          className,
        )}
      >
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t("visit.noContract")}
      </p>
    );
  }

  return (
    <Link
      to="/elevators/$id/visits/new"
      params={{ id: elevator.id }}
      className={cn(buttonVariants({ size }), className)}
    >
      <ClipboardCheck />
      {t("visit.record")}
    </Link>
  );
}

/** One line per visit: the day, the outcome, who, and what needs looking at. */
export function VisitHistoryList({
  elevatorId,
  rows,
  total,
  loading,
  error,
}: {
  elevatorId: string;
  rows: MaintenanceVisit[];
  total: number;
  loading: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();

  if (loading) return <p className="text-help text-subtle">{t("common.loading")}</p>;
  if (error) return <p className="text-help text-destructive">{errorMessage(error, t)}</p>;
  if (rows.length === 0) return <p className="text-help text-subtle">{t("visit.historyEmpty")}</p>;

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {rows.map((visit) => {
          const attention = attentionCount(visit.items);
          return (
            <li key={visit.id} className="border-b border-border-subtle last:border-0">
              {/* The whole row is the link: on a phone the date alone is too
                  small a target to hit with a glove on. */}
              <Link
                to="/maintenance-visits/$id"
                params={{ id: visit.id }}
                className="flex min-h-control-lg items-center gap-3 py-2 hover:bg-muted/50 focus-ring"
              >
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="tnum text-cell">{toDisplay(visit.visit_date)}</span>
                  <span className="truncate text-help text-muted-foreground">
                    {visit.technician_name}
                  </span>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {attention > 0 && (
                    <span className="inline-flex items-center gap-1 text-help text-warning">
                      <TriangleAlert className="size-3" aria-hidden="true" />
                      {t("visit.attentionCount", { count: attention })}
                    </span>
                  )}
                  <VisitStatusChip value={visit.status} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Only when there is more than the panel shows: "all" over a list that
          is already all of them is a link to the same five rows. */}
      {total > rows.length && (
        <Link
          to="/maintenance-visits"
          search={{ elevator: elevatorId }}
          className="mt-2 self-start text-help text-primary hover:underline"
        >
          {t("visit.viewAll", { count: total })}
        </Link>
      )}
    </div>
  );
}
