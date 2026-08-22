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
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  elevatorAttachmentsQuery,
  elevatorHistoryQuery,
  elevatorKeys,
  elevatorQuery,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { describeAuditEntry } from "@/lib/audit";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/i18n";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from "@/lib/format";
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

export function ElevatorDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();
  const [tab, setTab] = useState<"record" | "attachments" | "history">("record");

  const elevatorId = id ?? "";
  const query = useQuery({ ...elevatorQuery(elevatorId), enabled: Boolean(elevatorId) });
  const attachmentsQuery = useQuery({
    ...elevatorAttachmentsQuery(elevatorId),
    enabled: Boolean(elevatorId),
  });
  // Only owners and admins may read the trail, so the request is not made for
  // anyone else — asking and swallowing a 403 on every visit would put a red
  // line in the console of every technician's browser.
  const canSeeHistory = role === "owner" || role === "admin";
  // Reading a file is wider than adding one: a technician needs the inspection
  // report on site and cannot upload it, which mirrors the server's matrix
  // rather than inventing a second rule here.
  const canEditAttachments = role === "owner" || role === "admin" || role === "operations";
  const historyQuery = useQuery({
    ...elevatorHistoryQuery(elevatorId),
    enabled: Boolean(elevatorId) && canSeeHistory,
  });

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError || !query.data) {
    return (
      <ListError
        message={errorMessage(query.error, t)}
        reference={supportReference(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const elevator = query.data;
  const attachments = attachmentsQuery.data?.results ?? [];
  const history = historyQuery.data?.results ?? [];
  // The record is flat: `classification`, `technical` and the rest were groups
  // in the fixture, invented before the schema existed. The field names were
  // always the contract's.
  const cls = elevator;
  const tech = elevator;
  const insp = elevator;
  const man = elevator;
  // The server drops the unit price for roles that may not see money, so its
  // presence is the permission. Repeating the role check here would be a second
  // rule to keep in step with the first.
  const contract = elevator.current_contract;

  return (
    <>
      {/* Narrow screens get the field view, not a squeezed desktop record —
          arriving here from a QR scan is a different task from reading the
          register at a desk. */}
      <div className="md:hidden">
        <ElevatorDetailMobile
          elevator={elevator}
          attachmentCount={attachments.length}
          viaQr={role === "technician"}
        />
      </div>

      <div className="hidden flex-col gap-4 p-6 md:flex">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/customers" className="hover:underline">
              {t("customer.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <Link to="/customers/$id" params={{ id: elevator.customer_id }} className="hover:underline">
              {elevator.customer_name}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <Link to="/buildings" className="hover:underline">
              {elevator.building_name}
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
            {/* Nullable in the record: a lift can be registered before anyone
                has counted its stops, and the fixture never had that case. */}
            {tech.stop_count != null && (
              <>
                <span>·</span>
                <span>{t("elevator.hints.stopCount", { count: tech.stop_count })}</span>
              </>
            )}
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
                {attachments.length}
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
              <AttachmentsPanel
                objectType="elevator"
                objectId={elevatorId}
                attachments={attachments}
                invalidateKey={elevatorKeys.attachments(elevatorId)}
                canWrite={canEditAttachments}
              />
            </Group>
          )}

          {tab === "history" && (
            <Group title={t("detail.tabs.history")}>
              {history.map((entry, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-0.5 border-b border-border-subtle py-2.5 last:border-0"
                >
                  <span className="text-cell">{describeAuditEntry(entry, t)}</span>
                  <span className="text-help text-muted-foreground">
                    {entry.user_name || t("audit.system")} · {formatDateTime(entry.created_at)}
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
              <FieldRow label={t("building.singular")} value={elevator.building_name} to="/buildings" />
              <FieldRow label={t("complex.singular")} value={elevator.complex_name} to="/complexes" />
              <FieldRow
                label={t("customer.singular")}
                value={elevator.customer_name}
                to="/customers/$id"
                params={{ id: elevator.customer_id }}
              />
              <FieldRow
                label={t("address.fields.neighborhood")}
                value={elevator.building_name}
              />
            </div>
          </RailCard>

          <RailCard title={t("detail.activeContract")}>
            {contract ? (
              <div className="flex flex-col">
                <FieldRow
                  label={t("contract.fields.contractNumber")}
                  value={contract.contract_number}
                  to="/contracts/$id"
                  params={{ id: contract.id }}
                />
                <FieldRow
                  label={t("contract.fields.scope")}
                  value={enumLabel("contract.scope", contract.scope)}
                />
                <FieldRow
                  label={t("contract.fields.endDate")}
                  value={formatDate(contract.end_date)}
                />
                {"unit_price" in contract ? (
                  <FieldRow
                    label={t("contract.fields.unitPrice")}
                    value={formatMoney(contract.unit_price)}
                  />
                ) : (
                  // Stated rather than silently dropped: the user should know
                  // the field exists and that the boundary is their role, not a
                  // gap in the record. The server decided this — the field is
                  // absent from the response, not hidden here.
                  <p className="pt-2 text-help text-subtle italic">{t("detail.hiddenForRole")}</p>
                )}
              </div>
            ) : (
              <p className="text-help text-subtle">{t("elevator.hints.noContract")}</p>
            )}
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
              {history.slice(0, 3).map((entry, index) => (
                <div key={index} className="flex flex-col leading-tight">
                  <span className="text-help">{describeAuditEntry(entry, t)}</span>
                  <span className="text-help text-subtle">
                    {entry.user_name || t("audit.system")} · {formatDateTime(entry.created_at)}
                  </span>
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-help text-subtle">
                  {canSeeHistory ? t("audit.empty") : t("detail.hiddenForRole")}
                </p>
              )}
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
