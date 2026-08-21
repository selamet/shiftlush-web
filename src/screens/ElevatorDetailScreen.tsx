import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import {
  ChevronRight,
  Pencil,
  Printer,
  QrCode,
  RefreshCw,
  TriangleAlert,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import elevator from "@fixtures/demo-elevator-detail.json";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { ElevatorDetailMobile } from "./ElevatorDetailMobile";
import { InspectionLabel } from "@/components/ui/inspection-label";

type Value = string | number | null | undefined;

/**
 * An empty optional field keeps its row and shows a dash.
 *
 * Collapsing it away would hide the fact that the value was never measured —
 * and on a maintenance record "not measured" is itself information the
 * technician needs before going to site.
 */
function FieldRow({
  label,
  value,
  to,
  params,
}: {
  label: string;
  value: Value;
  /** Turns the value into a link. Used for the related-record rail. */
  to?: string;
  params?: Record<string, string>;
}) {
  const empty = value == null || value === "";
  const body = empty ? "—" : value;

  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="shrink-0 text-help text-muted-foreground">{label}</span>
      {to && !empty ? (
        <Link
          to={to}
          params={params}
          className="min-w-0 text-right text-cell text-primary break-words hover:underline"
        >
          {body}
        </Link>
      ) : (
        <span className={cn("min-w-0 text-right text-cell break-words", empty && "text-subtle")}>
          {body}
        </span>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <h2 className="mb-2 text-cardtitle">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-4">
      <h2 className="mb-2.5 text-colhead uppercase text-subtle">{title}</h2>
      {children}
    </section>
  );
}

const ATTACHMENT_ICON = {
  photo: ImageIcon,
} as const;

export function ElevatorDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();
  const [tab, setTab] = useState<"record" | "attachments" | "history">("record");

  const { classification: cls, technical: tech, inspection: insp, manufacturing: man } = elevator;
  // Contract money is scoped by role: operations runs the fleet, accounting
  // runs the money, and neither needs the other's column.
  const canSeeFinancials = role === "owner" || role === "admin" || role === "accountant";

  return (
    <>
      {/* Narrow screens get the field view, not a squeezed desktop record —
          arriving here from a QR scan is a different task from reading the
          register at a desk. */}
      <div className="md:hidden">
        <ElevatorDetailMobile viaQr={role === "technician"} />
      </div>

      <div className="hidden flex-col gap-4 p-6 md:flex">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/customers" className="hover:underline">
              {t("customer.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <Link to="/customers/$id" params={{ id: "c1" }} className="hover:underline">
              {elevator.customer}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <Link to="/buildings" className="hover:underline">
              {elevator.building}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{elevator.name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title">{elevator.name}</h1>
            <ElevatorStatusChip value={elevator.status} />
            <InspectionLabel value={elevator.inspection_label} />
          </div>
          <p className="flex flex-wrap items-center gap-2 text-help text-muted-foreground">
            <span className="font-mono tnum">{elevator.registration_number}</span>
            <span>·</span>
            <span>{enumLabel("elevator.category", cls.category)}</span>
            <span>·</span>
            <span>
              {man.brand} {man.model}
            </span>
            <span>·</span>
            <span>{t("elevator.hints.stopCount", { count: tech.stop_count })}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Printer />
            {t("qr.printLabels")}
          </Button>
          <Link
            to="/elevators/$id/edit"
            params={{ id: id ?? "e1" }}
            className={buttonVariants({ size: "sm" })}
          >
            <Pencil />
            {t("common.edit")}
          </Link>
        </div>
      </div>

      {/* A missing car door is a serious non-conformity at inspection, so it
          sits above the record as a warning rather than as one row of 31. */}
      {!cls.has_car_door && <Alert tone="warning" title={t("elevator.hints.noCarDoor")} />}

      <div className="flex gap-1 border-b border-border">
        {(["record", "attachments", "history"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex h-control-md items-center gap-2 px-3 text-body transition-colors focus-ring",
              tab === key
                ? "border-b-2 border-primary font-medium text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`detail.tabs.${key}`)}
            {key === "attachments" && (
              <span className="tnum rounded-full bg-muted px-1.5 text-help text-muted-foreground">
                {elevator.attachments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: the elevator itself, grouped exactly like the edit form's tabs
            so the user meets the same order when they switch to editing. */}
        <div className="flex flex-col gap-4">
          {tab === "record" && (
            <>
              <Group title={t("elevator.tabs.classification")}>
                <FieldRow
                  label={t("elevator.fields.category")}
                  value={enumLabel("elevator.category", cls.category)}
                />
                <FieldRow
                  label={t("elevator.fields.driveType")}
                  value={enumLabel("elevator.driveType", cls.drive_type)}
                />
                <FieldRow
                  label={t("elevator.fields.controlType")}
                  value={enumLabel("elevator.controlType", cls.control_type)}
                />
                <FieldRow
                  label={t("elevator.fields.doorType")}
                  value={enumLabel("elevator.doorType", cls.door_type)}
                />
                <FieldRow
                  label={t("elevator.fields.hasCarDoor")}
                  value={cls.has_car_door ? t("common.yes") : t("common.no")}
                />
                <FieldRow
                  label={t("elevator.fields.machineRoom")}
                  value={enumLabel("elevator.machineRoom", cls.machine_room)}
                />
              </Group>

              <Group title={t("elevator.tabs.technical")}>
                <FieldRow
                  label={t("elevator.fields.capacityKg")}
                  value={formatNumber(tech.capacity_kg)}
                />
                <FieldRow
                  label={t("elevator.fields.capacityPersons")}
                  value={tech.capacity_persons}
                />
                <FieldRow label={t("elevator.fields.stopCount")} value={tech.stop_count} />
                <FieldRow label={t("elevator.fields.entranceCount")} value={tech.entrance_count} />
                <FieldRow label={t("elevator.fields.speedMps")} value={tech.speed_mps} />
                <FieldRow
                  label={t("elevator.fields.pitDepthMm")}
                  value={formatNumber(tech.pit_depth_mm)}
                />
                <FieldRow label={t("elevator.fields.headroomMm")} value={tech.headroom_mm} />
                <FieldRow label={t("elevator.fields.carWeightKg")} value={tech.car_weight_kg} />
              </Group>

              <Group title={t("elevator.tabs.inspection")}>
                <FieldRow
                  label={t("elevator.fields.lastInspectionDate")}
                  value={formatDate(insp.last_inspection_date)}
                />
                <FieldRow
                  label={t("elevator.fields.nextInspectionDate")}
                  value={formatDate(insp.next_inspection_date)}
                />
                <FieldRow
                  label={t("elevator.fields.inspectionBody")}
                  value={insp.inspection_body}
                />
                <FieldRow
                  label={t("elevator.fields.inspectionReportNumber")}
                  value={insp.inspection_report_number}
                />
              </Group>

              <Group title={t("elevator.tabs.manufacturing")}>
                <FieldRow label={t("elevator.fields.brand")} value={man.brand} />
                <FieldRow label={t("elevator.fields.model")} value={man.model} />
                <FieldRow label={t("elevator.fields.serialNumber")} value={man.serial_number} />
                <FieldRow
                  label={t("elevator.fields.installationDate")}
                  value={formatDate(man.installation_date)}
                />
                <FieldRow
                  label={t("elevator.fields.commissioningDate")}
                  value={formatDate(man.commissioning_date)}
                />
                <FieldRow label={t("elevator.fields.manufacturer")} value={man.manufacturer} />
                <FieldRow label={t("elevator.fields.installer")} value={man.installer} />
                <FieldRow
                  label={t("elevator.fields.ceCertificateNumber")}
                  value={man.ce_certificate_number}
                />
                <FieldRow
                  label={t("elevator.fields.warrantyEndDate")}
                  value={formatDate(man.warranty_end_date)}
                />
              </Group>
            </>
          )}

          {tab === "attachments" && (
            <Group title={t("detail.tabs.attachments")}>
              {elevator.attachments.map((file) => {
                const Icon =
                  ATTACHMENT_ICON[file.category as keyof typeof ATTACHMENT_ICON] ?? FileText;
                return (
                  <div
                    key={file.name}
                    className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="text-cell">{file.name}</span>
                      <span className="text-help text-muted-foreground">
                        {enumLabel("attachment.category", file.category)}
                      </span>
                    </div>
                    <span className="ml-auto text-help text-subtle">{file.size}</span>
                  </div>
                );
              })}
            </Group>
          )}

          {tab === "history" && (
            <Group title={t("detail.tabs.history")}>
              {elevator.history.map((entry, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-0.5 border-b border-border-subtle py-2.5 last:border-0"
                >
                  <span className="text-cell">
                    {entry.field}
                    {entry.change && (
                      <span className="ml-2 text-muted-foreground">{entry.change}</span>
                    )}
                  </span>
                  <span className="text-help text-muted-foreground">
                    {entry.actor} · {formatDateTime(entry.at)}
                  </span>
                </div>
              ))}
            </Group>
          )}
        </div>

        {/* Right rail: everything the elevator relates to, never the elevator. */}
        <div className="flex flex-col gap-4">
          <RailCard title={t("detail.relatedRecords")}>
            <div className="flex flex-col">
              <FieldRow label={t("building.singular")} value={elevator.building} to="/buildings" />
              <FieldRow label={t("complex.singular")} value={elevator.complex} to="/complexes" />
              <FieldRow
                label={t("customer.singular")}
                value={elevator.customer}
                to="/customers/$id"
                params={{ id: "c1" }}
              />
              <FieldRow
                label={t("address.fields.neighborhood")}
                value={`${elevator.neighborhood} · ${elevator.district}`}
              />
            </div>
          </RailCard>

          <RailCard title={t("detail.activeContract")}>
            <div className="flex flex-col">
              <FieldRow
                label={t("contract.fields.contractNumber")}
                value={elevator.contract.contract_number}
                to="/contracts/$id"
                params={{ id: "k1" }}
              />
              <FieldRow
                label={t("contract.fields.scope")}
                value={enumLabel("contract.scope", elevator.contract.scope)}
              />
              <FieldRow
                label={t("contract.fields.endDate")}
                value={formatDate(elevator.contract.end_date)}
              />
              {canSeeFinancials ? (
                <FieldRow
                  label={t("contract.fields.unitPrice")}
                  value={formatMoney(elevator.contract.unit_price)}
                />
              ) : (
                // Stated rather than silently dropped: the user should know the
                // field exists and that the boundary is their role, not a gap
                // in the record.
                <p className="pt-2 text-help text-subtle italic">{t("detail.hiddenForRole")}</p>
              )}
            </div>
          </RailCard>

          <RailCard title={t("detail.qrCode")}>
            <div className="flex items-center gap-3">
              <div className="grid size-16 shrink-0 place-items-center rounded-md border border-border bg-muted">
                <QrCode className="size-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <span className="font-mono text-help text-muted-foreground">
                /q/{elevator.qr_token}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="xs" variant="secondary">
                <Printer />
                {t("qr.printLabels")}
              </Button>
              <Button size="xs" variant="ghost">
                <RefreshCw />
                {t("qr.regenerate")}
              </Button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-help text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              {t("elevator.hints.qrRegenerateWarning")}
            </p>
          </RailCard>

          <RailCard title={t("detail.tabs.history")}>
            <div className="flex flex-col gap-2">
              {elevator.history.slice(0, 3).map((entry, index) => (
                <div key={index} className="flex flex-col leading-tight">
                  <span className="text-help">{entry.field}</span>
                  <span className="text-help text-subtle">
                    {entry.actor} · {formatDateTime(entry.at)}
                  </span>
                </div>
              ))}
              <button type="button" className="self-start text-help text-primary hover:underline">
                {t("detail.viewAllHistory")}
              </button>
            </div>
          </RailCard>
        </div>
      </div>
    </div>
    </>
  );
}
