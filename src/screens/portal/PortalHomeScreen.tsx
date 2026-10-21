import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CircleCheck, TriangleAlert } from "lucide-react";
import { errorMessage, supportReference } from "@/api/errors";
import { portalElevatorsQuery, portalFaultsQuery } from "@/api/portal-queries";
import { toDisplay, todayIso } from "@/lib/date";
import { liftAttention, type LiftAttention } from "@/lib/portal";
import { usePortalSession } from "@/lib/portal-session";
import { cn } from "@/lib/utils";
import { ListError, TableSkeleton } from "@/components/list/ListStates";
import { InspectionLabel } from "@/components/ui/inspection-label";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { CorrectionDeadline } from "@/components/inspections/CorrectionDeadline";

/**
 * The customer's lifts, each with the one thing worth knowing first.
 *
 * A building manager opens this to answer "is everything all right with our
 * lifts?" — so each lift says so in words: not running, a fault being worked
 * on, an inspection or a maintenance visit overdue, or nothing to worry about.
 * The dates follow, for the manager who wants to tell residents when the
 * technician is next coming.
 */
export function PortalHomeScreen() {
  const { t } = useTranslation();
  const { me } = usePortalSession();
  const lifts = useQuery(portalElevatorsQuery());
  const faults = useQuery(portalFaultsQuery());
  const today = todayIso();

  if (lifts.isPending) return <TableSkeleton columns={1} rows={3} />;
  if (lifts.isError) {
    return (
      <ListError
        message={errorMessage(lifts.error, t)}
        reference={supportReference(lifts.error)}
        onRetry={() => void lifts.refetch()}
      />
    );
  }

  const rows = lifts.data.results;
  const allFaults = faults.data?.results ?? [];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("portal.home.title")}</h1>
        {me?.contact_name && (
          <p className="text-body text-muted-foreground">{t("portal.home.greeting", { name: me.contact_name })}</p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-body text-muted-foreground">
          {t("portal.home.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((lift) => {
            const { attention, openFaults } = liftAttention(lift, allFaults, today);
            return (
              <li key={lift.id}>
                <Link
                  to="/portal/elevators/$id"
                  params={{ id: lift.id }}
                  className="flex items-center gap-3 rounded-lg border border-border-subtle bg-card p-4 hover:bg-muted focus-ring"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-cardtitle">{lift.name}</span>
                      <ElevatorStatusChip value={lift.status} />
                    </span>
                    <span className="text-help text-muted-foreground">{lift.building_name}</span>
                    <AttentionLine attention={attention} openFaults={openFaults} />
                    <span className="grid gap-x-4 gap-y-1 text-help text-muted-foreground sm:grid-cols-2">
                      <span>
                        {t("portal.home.nextMaintenance")}:{" "}
                        <span className="tnum text-foreground">{toDisplay(lift.next_maintenance_date) || "—"}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {t("portal.home.nextInspection")}:{" "}
                        <span className="tnum text-foreground">{toDisplay(lift.next_inspection_date) || "—"}</span>
                        <InspectionLabel value={lift.inspection_label} />
                      </span>
                      <CorrectionDeadline lift={lift} className="text-foreground sm:col-span-2" />
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** The first thing to say about a lift, in words with an icon. */
function AttentionLine({ attention, openFaults }: { attention: LiftAttention; openFaults: number }) {
  const { t } = useTranslation();
  const ok = attention === "ok";
  const Icon = ok ? CircleCheck : TriangleAlert;
  return (
    <span className={cn("flex items-center gap-1.5 text-body", ok ? "text-success" : "font-medium text-foreground")}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {attention === "fault"
        ? t("portal.attention.fault", { count: openFaults })
        : t(`portal.attention.${attention}`)}
    </span>
  );
}
