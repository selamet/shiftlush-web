import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { ChevronRight, MapPin, Wrench } from "lucide-react";
import { faultListQuery, type Fault } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { MY_ACTIVE_STATUSES, boardOrder, isOffice, myFaultParams } from "@/lib/faults";
import { ListError, TableSkeleton } from "@/components/list/ListStates";
import { ResponseTimer } from "@/components/faults/ResponseTimer";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { TechnicianTabs } from "@/components/plan/TechnicianTabs";
import { FaultPriorityChip, FaultStatusChip } from "@/components/ui/status-chip";

/**
 * "My faults": the faults given to this technician that are not yet done.
 *
 * Beside the day's route, because a fault is the interruption to it — and the
 * worst first, an emergency at the top with its siren, so the choice between
 * the next planned lift and a trapped passenger is made by the list. Each row
 * opens the fault, where "arrived" and "resolved" are the buttons at the bottom
 * of the screen.
 */
export function MyFaultsScreen() {
  const { t } = useTranslation();
  const { role, userId } = useSession();
  const isTechnician = role === "technician" && userId !== null;

  const queries = useQueries({
    queries: MY_ACTIVE_STATUSES.map((status) => ({
      ...faultListQuery(myFaultParams(userId ?? "", status)),
      enabled: isTechnician,
    })),
  });

  if (!isTechnician) {
    if (isOffice(role)) {
      return (
        <div className="flex flex-col gap-3 px-6 py-16 text-center">
          <Wrench className="size-8 self-center text-subtle" aria-hidden="true" />
          <p className="text-body text-muted-foreground">{t("fault.mineTechnicianOnly")}</p>
          <Link to="/faults" className="self-center text-body text-primary hover:underline">
            {t("fault.goToBoard")}
          </Link>
        </div>
      );
    }
    return <PlanRestricted titleKey="fault.restricted" />;
  }

  const pending = queries.some((query) => query.isPending);
  const failed = queries.find((query) => query.isError);
  const rows: Fault[] = queries.flatMap((query) => query.data?.results ?? []).sort(boardOrder);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-6">
      <h1 className="text-title">{t("fault.mine")}</h1>
      <TechnicianTabs active="faults" faultCount={rows.length} />

      {pending ? (
        <TableSkeleton columns={1} rows={3} />
      ) : failed ? (
        <ListError
          message={errorMessage(failed.error, t)}
          reference={supportReference(failed.error)}
          onRetry={() => queries.forEach((query) => void query.refetch())}
        />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <Wrench className="size-8 text-subtle" aria-hidden="true" />
          <p className="text-body text-muted-foreground">{t("fault.mineEmpty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to="/faults/$id"
                params={{ id: row.id }}
                className={cn(
                  "flex min-h-control-xl items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted focus-ring",
                  row.priority === "emergency" ? "border-2 border-foreground" : "border-border-subtle",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
                  <span className="flex flex-wrap items-center gap-2">
                    <FaultPriorityChip value={row.priority} />
                    <span className="font-mono tnum text-help text-muted-foreground">{row.reference}</span>
                  </span>
                  <span className="text-cardtitle">{row.elevator_name}</span>
                  <span className="flex items-center gap-1 text-help text-muted-foreground">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {row.building_name} · {row.customer_name}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-help text-muted-foreground">
                    <FaultStatusChip value={row.status} />
                    <ResponseTimer fault={row} />
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
