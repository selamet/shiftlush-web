import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import type { Elevator, MaintenanceVisit } from "@/api/queries";
import type { Role } from "@/components/layout/nav-config";
import { QrCode, WifiOff, TriangleAlert, Paperclip, MapPin, Siren } from "lucide-react";
import { enumLabel } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber, formatDecimal } from "@/lib/format";
import { toDisplay } from "@/lib/date";
import { canRecordVisits } from "@/lib/visit";
import { canReadPlan } from "@/lib/plan";
import { canUseFaults } from "@/lib/faults";
import { canReadInspections, canRecordInspections } from "@/lib/inspections";
import { InspectionHistory, RecordInspectionLink } from "@/components/inspections/InspectionHistory";
import { correctionSummary } from "@/components/inspections/CorrectionDeadline";
import { ElevatorPlanCard } from "@/components/plan/ElevatorPlanCard";
import { buttonVariants } from "@/components/ui/button";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { InspectionLabel } from "@/components/ui/inspection-label";
import { RecordVisitAction, VisitHistoryList } from "@/components/visits/ElevatorVisits";

/**
 * The record as the technician meets it: scanned a QR in a machine room, one
 * hand free, gloves on, poor signal, dim light.
 *
 * The header is dark whatever the theme — a bright screen at arm's length in a
 * dark shaft room is the wrong thing to hand someone. The two chips state the
 * context before anything else, because how you arrived changes what you
 * expect to see.
 *
 * Of the record's 31 fields only eight appear, the eight that decide what
 * happens next on site; the rest is a scroll away. The record itself cannot be
 * edited from here, and that is said once, plainly, rather than left as a
 * screen of things that quietly do nothing. What can be done here is the job
 * the technician came for — record the visit — and that is the action at the
 * bottom of the screen.
 */
/**
 * Takes the record as a prop rather than fetching it.
 *
 * The desktop screen renders this one below `md` and has already loaded the
 * elevator; fetching it again here would mean two requests for one page and two
 * places for the same record to be stale in different ways.
 */
export function ElevatorDetailMobile({
  elevator,
  attachmentCount,
  viaQr,
  role,
  visits,
}: {
  elevator: Elevator;
  attachmentCount: number;
  viaQr?: boolean;
  role: Role | null;
  /**
   * The visit history, from the parent's query — the same reason the record
   * is a prop. Absent for a role that may not read visits, and then neither
   * the maintenance dates nor the panel are drawn.
   */
  visits?: {
    rows: MaintenanceVisit[];
    total: number;
    loading: boolean;
    error: unknown;
  };
}) {
  const { t } = useTranslation();
  // Flat record: the fixture's `technical` and `manufacturing` groups never
  // existed in the schema, only the field names did.
  const tech = elevator;
  const insp = elevator;
  const man = elevator;
  const cls = elevator;

  const facts: Array<[string, React.ReactNode]> = [
    [t("detail.brandModel"), `${man.brand} ${man.model}`],
    [
      t("detail.capacity"),
      t("detail.capacityValue", {
        kg: formatNumber(tech.capacity_kg),
        persons: tech.capacity_persons,
      }),
    ],
    [t("elevator.fields.stopCount"), tech.stop_count],
    [t("elevator.fields.speedMps"), tech.speed_mps ? `${formatDecimal(tech.speed_mps)} m/s` : "—"],
    [t("elevator.fields.lastInspectionDate"), formatDate(insp.last_inspection_date)],
    [t("elevator.fields.nextInspectionDate"), formatDate(insp.next_inspection_date)],
    ...(insp.correction_deadline
      ? ([[t("inspection.correctionDeadline"), correctionSummary(insp, t)]] as Array<[string, React.ReactNode]>)
      : []),
    // Next to the inspection dates rather than in a section of their own: on
    // site the question is "is this lift due?", and both pairs answer it.
    ...(visits
      ? ([
          [t("visit.lastMaintenance"), toDisplay(elevator.last_maintenance_date) || "—"],
          [t("visit.nextMaintenance"), toDisplay(elevator.next_maintenance_date) || "—"],
        ] as Array<[string, React.ReactNode]>)
      : []),
  ];
  const recordsVisits = canRecordVisits(role);

  return (
    <div className="flex min-h-full flex-col bg-background">
      {/* `dark` is forced here, not inherited: the reason is the room, not the
          user's theme preference. */}
      <header className="dark flex flex-col gap-2.5 bg-background px-4 pb-4 pt-3 text-foreground">
        {viaQr && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-sm border border-border-strong px-2 py-0.5 text-help text-muted-foreground">
              <QrCode className="size-3 shrink-0" aria-hidden="true" />
              {t("detail.openedViaQr")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-help text-muted-foreground">
              <WifiOff className="size-3 shrink-0" aria-hidden="true" />
              {t("detail.weakConnection")}
            </span>
          </div>
        )}

        <h1 className="text-title">{elevator.name}</h1>
        <span className="font-mono tnum text-body text-muted-foreground">
          {elevator.registration_number}
        </span>

        <div className="flex flex-wrap items-center gap-2.5">
          <InspectionLabel value={elevator.inspection_label} />
          <ElevatorStatusChip value={elevator.status} />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {!cls.has_car_door && (
          <div className="flex items-start gap-2 rounded-md border-l-[3px] border-warning bg-warning-bg px-3 py-2.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="text-body text-warning">{t("elevator.hints.noCarDoor")}</span>
          </div>
        )}

        <section className="rounded-lg border border-border-subtle bg-card p-4">
          <span className="text-colhead uppercase text-subtle">{t("building.singular")}</span>
          <p className="mt-1 text-body">{elevator.building_name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-help text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {elevator.customer_name}
          </p>
        </section>

        {/* Six values, eight with the maintenance dates, in a two-column grid. Everything else is below. */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle">
          {facts.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 bg-card p-3">
              <span className="text-help text-muted-foreground">{label}</span>
              <span className="tnum text-body">{value}</span>
            </div>
          ))}
        </section>

        <section className="flex items-center gap-3 rounded-lg border border-border-subtle bg-card p-4">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-body">{t("detail.tabs.attachments")}</span>
          <span className="tnum ml-auto rounded-full bg-muted px-2 text-help text-muted-foreground">
            {attachmentCount}
          </span>
        </section>

        {canReadInspections(role) && (
          <section className="rounded-lg border border-border-subtle bg-card p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-colhead uppercase text-subtle">{t("inspection.history")}</h2>
              {canRecordInspections(role) && <RecordInspectionLink elevatorId={elevator.id} />}
            </div>
            <InspectionHistory elevatorId={elevator.id} canWrite={canRecordInspections(role)} compact />
          </section>
        )}

        {canReadPlan(role) && (
          <section className="rounded-lg border border-border-subtle bg-card p-4">
            <h2 className="mb-1 text-colhead uppercase text-subtle">{t("plan.thisMonth")}</h2>
            <ElevatorPlanCard elevatorId={elevator.id} enabled />
          </section>
        )}

        {visits && (
          <section className="rounded-lg border border-border-subtle bg-card p-4">
            <h2 className="mb-1 text-colhead uppercase text-subtle">{t("visit.history")}</h2>
            <VisitHistoryList
              elevatorId={elevator.id}
              rows={visits.rows}
              total={visits.total}
              loading={visits.loading}
              error={visits.error}
            />
          </section>
        )}

        {/* The role that is actually signed in. This used to say "technician"
            whoever was holding the phone. */}
        <p className="text-help text-muted-foreground">
          {t("detail.yourRole")}: {enumLabel("user.role", role)} —{" "}
          {recordsVisits ? t("detail.recordOnlyNotice") : t("detail.readOnlyNotice")}
        </p>
      </div>

      {/* The primary action at the gloved-hand height: recording the visit,
          which is what the technician scanned the sticker to do. Scanning the
          next lift stays, one step down — it is the action after this one.

          Links rather than buttons: both are navigations, and made buttons
          they would lose what a link gives for free on a phone — long-press to
          open in a second tab, and a destination the browser restores if the
          page is reloaded mid-round.

          With no contract the record action is replaced by its reason, and
          scanning the next lift becomes the primary action again: there is
          nothing else to do here. */}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-card p-3">
        {recordsVisits && (
          <RecordVisitAction elevator={elevator} size="xl" className="w-full" />
        )}
        {/* Beside recording the visit: the same hand, the same moment — a
            technician who finds a fault on a round reports it from here. */}
        {canUseFaults(role) && (
          <Link
            to="/elevators/$id/faults/new"
            params={{ id: elevator.id }}
            className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "w-full")}
          >
            <Siren />
            {t("fault.report")}
          </Link>
        )}
        <Link
          to="/scan"
          className={cn(
            buttonVariants({
              size: recordsVisits && elevator.current_contract ? "lg" : "xl",
              variant: recordsVisits && elevator.current_contract ? "secondary" : "primary",
            }),
            "w-full",
          )}
        >
          <QrCode />
          {t("detail.scanAnother")}
        </Link>
      </div>
    </div>
  );
}
