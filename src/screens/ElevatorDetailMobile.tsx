import { useTranslation } from "react-i18next";
import type { Elevator } from "@/api/queries";
import { QrCode, WifiOff, TriangleAlert, Paperclip, MapPin } from "lucide-react";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { InspectionLabel } from "@/components/ui/inspection-label";

/**
 * The record as the technician meets it: scanned a QR in a machine room, one
 * hand free, gloves on, poor signal, dim light.
 *
 * The header is dark whatever the theme — a bright screen at arm's length in a
 * dark shaft room is the wrong thing to hand someone. The two chips state the
 * context before anything else, because how you arrived changes what you
 * expect to see.
 *
 * Of the record's 31 fields only six appear, the six that decide what happens
 * next on site; the rest is a scroll away. And because this role cannot write,
 * there is no add or edit control anywhere — that is said once, plainly,
 * rather than left as a screen of things that quietly do nothing.
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
}: {
  elevator: Elevator;
  attachmentCount: number;
  viaQr?: boolean;
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
    [t("elevator.fields.speedMps"), tech.speed_mps ? `${tech.speed_mps} m/s` : "—"],
    [t("elevator.fields.lastInspectionDate"), formatDate(insp.last_inspection_date)],
    [t("elevator.fields.nextInspectionDate"), formatDate(insp.next_inspection_date)],
  ];

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

        {/* Six values, in a two-column grid. Everything else is below. */}
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

        <p className="text-help text-muted-foreground">
          {t("detail.yourRole")}: {enumLabel("user.role", "technician")} —{" "}
          {t("detail.readOnlyNotice")}
        </p>
      </div>

      {/* One action, at the gloved-hand height. */}
      <div className="sticky bottom-0 border-t border-border bg-card p-3">
        <Button size="xl" className="w-full">
          <QrCode />
          {t("detail.scanAnother")}
        </Button>
      </div>
    </div>
  );
}
