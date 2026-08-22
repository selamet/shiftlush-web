import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import {
  ChevronRight,
  ExternalLink,
  FileDown,
  Loader2,
  Pencil,
  Printer,
  QrCode,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  elevatorAttachmentsQuery,
  elevatorHistoryQuery,
  elevatorKeys,
  elevatorQuery,
  fetchLabelPdf,
  regenerateQr,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { describeAuditEntry } from "@/lib/audit";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { elevatorFileStem } from "@/lib/elevator";
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

/**
 * One button, two places on the page.
 *
 * The header and the QR card offer the same action, and the header is the one
 * a person reaches for while the card is the one they are looking at when they
 * think about the sticker. Defining the control once is what keeps the second
 * copy from quietly becoming a different button — a different label, a
 * different busy state, or nothing at all, which is how it started.
 */
function PrintLabelButton({
  size,
  busy,
  onClick,
}: {
  size: "xs" | "sm";
  busy: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Button variant="secondary" size={size} disabled={busy} onClick={onClick}>
      {busy ? <Loader2 className="animate-spin" /> : <Printer />}
      {busy ? t("qrLabels.generating") : t("qr.printLabels")}
    </Button>
  );
}

/**
 * The finished sheet, offered rather than forced on the browser.
 *
 * Two links, not a click synthesised in code: the request is awaited, so by the
 * time the PDF exists the gesture that asked for it is over as far as the
 * browser is concerned — a tab opened then is a popup, and a download started
 * then is one nobody asked for. A sandboxed viewer may also refuse to render a
 * blob, which is why the download stands next to the open. `QrLabelScreen`
 * makes the same offer for the same reason.
 */
function LabelSheet({
  url,
  filename,
  error,
}: {
  url: string;
  filename: string;
  error: unknown;
}) {
  const { t } = useTranslation();

  if (error) {
    return (
      <Alert tone="error" block>
        {errorMessage(error, t)}
      </Alert>
    );
  }
  if (!url) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-success bg-success-bg/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label text-success">{t("qrLabels.ready")}</span>
        <a
          href={url}
          download={filename}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <FileDown />
          {t("qrLabels.downloadPdf")}
        </a>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ExternalLink />
          {t("qrLabels.openPdf")}
        </a>
      </div>
      {/* One lift is one label on a sheet of twelve. Said before the paper comes
          out, because eleven blank cells look like a fault otherwise. */}
      <p className="text-help text-muted-foreground">{t("qrLabels.singleLabelNote")}</p>
    </div>
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

  const queryClient = useQueryClient();
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  // Which of the two print buttons asked. The sheet appears beside the control
  // that was pressed: the QR card is a long way down the right rail, and a
  // notice at the top of the page for a button at the bottom of it is a notice
  // the user scrolls past looking for the thing that already happened.
  const [sheetSlot, setSheetSlot] = useState<"header" | "rail">("header");

  // Held in a ref as well as in state, because the unmount cleanup closes over
  // the state as it was at the last render, and revoking the wrong URL leaks
  // the right one. Same reasoning as `QrLabelScreen`.
  const [sheetUrl, setSheetUrl] = useState("");
  const sheetUrlRef = useRef("");

  const replaceSheet = useCallback((blob: Blob | null) => {
    if (sheetUrlRef.current) URL.revokeObjectURL(sheetUrlRef.current);
    const next = blob ? URL.createObjectURL(blob) : "";
    sheetUrlRef.current = next;
    setSheetUrl(next);
  }, []);

  useEffect(() => () => replaceSheet(null), [replaceSheet]);

  /**
   * The label, as the server renders it.
   *
   * `fetchLabelPdf` is the same call the QR label screen makes with a list;
   * here the list is one lift. Nothing on this screen draws a label — the
   * artwork lives in the server's template, and a second renderer would be a
   * second sticker for one lift, drifting, only one of which gets stuck to a
   * wall.
   */
  const labelSheet = useMutation({
    // A sheet already on screen describes the token as it was when it was made.
    // Clearing it at the start of the next request means the user is never
    // looking at a "ready" panel while a newer answer is in flight.
    onMutate: () => replaceSheet(null),
    mutationFn: () => fetchLabelPdf([elevatorId]),
    onSuccess: (blob) => replaceSheet(blob),
  });

  /**
   * A new QR token, which kills every label already printed for this lift.
   *
   * Guarded by a heavy confirmation rather than run on the click: the sticker
   * in the machine room stops resolving the moment this returns, and the person
   * who finds that out is a technician standing in front of the lift with a
   * phone that no longer opens anything.
   */
  const regenerate = useMutation({
    mutationFn: () => regenerateQr(elevatorId),
    onSuccess: async () => {
      // Any sheet made before this carries the previous token, so it would
      // print a sticker that resolves to nothing.
      replaceSheet(null);
      labelSheet.reset();
      await queryClient.invalidateQueries({ queryKey: elevatorKeys.all });
    },
  });

  function printLabel(slot: "header" | "rail") {
    setSheetSlot(slot);
    labelSheet.mutate();
  }

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
  // Named after the lift rather than "download.pdf": the sheet is printed on
  // one day and stuck to a wall on another, and in between it sits in a folder
  // with the other four somebody saved this week.
  const sheetFilename = `qr-${elevatorFileStem(elevator)}.pdf`;
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
          <PrintLabelButton
            size="sm"
            busy={labelSheet.isPending}
            onClick={() => printLabel("header")}
          />
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

      {sheetSlot === "header" && (
        <LabelSheet url={sheetUrl} filename={sheetFilename} error={labelSheet.error} />
      )}

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
              <PrintLabelButton
                size="xs"
                busy={labelSheet.isPending}
                onClick={() => printLabel("rail")}
              />
              <Button
                size="xs"
                variant="ghost"
                disabled={regenerate.isPending}
                onClick={() => setConfirmingRegenerate(true)}
              >
                <RefreshCw className={cn(regenerate.isPending && "animate-spin")} />
                {regenerate.isPending ? t("qrLabels.regenerating") : t("qr.regenerate")}
              </Button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-help text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              {t("elevator.hints.qrRegenerateWarning")}
            </p>

            <div className="mt-3 flex flex-col gap-2 empty:mt-0">
              {sheetSlot === "rail" && (
                <LabelSheet url={sheetUrl} filename={sheetFilename} error={labelSheet.error} />
              )}
              {/* The instruction, not just the outcome: a token that has been
                  replaced is only half the job, and the other half is a person
                  walking to the machine room with a new sticker. */}
              {regenerate.isSuccess && (
                <Alert tone="success" block>
                  {t("qrLabels.regenerateDone", { name: elevator.registration_number })}
                </Alert>
              )}
              {regenerate.isError && (
                <Alert tone="error" block>
                  {errorMessage(regenerate.error, t)}
                </Alert>
              )}
            </div>
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
              {/* The audit log list, scoped to this lift. It now reads
                  `table_name` and `record_id` from its URL, which was the
                  condition this link was waiting on: before that it could only
                  land on every row the firm has and call it this lift's
                  history. The rail shows three entries and the tab shows a
                  page; the whole trail is more than either, and it is where
                  you can carry on narrowing by who and by when.

                  Still behind `canSeeHistory` — owner and admin only, the same
                  rule the query obeys rather than a second one beside it — so
                  this never offers a route that would answer 403. */}
              {canSeeHistory && history.length > 0 && (
                <Link
                  to="/audit-logs"
                  search={{ table_name: "elevator", record_id: elevatorId }}
                  className="self-start text-help text-primary hover:underline"
                >
                  {t("detail.viewAllHistory")}
                </Link>
              )}
            </div>
          </RailCard>
        </div>
      </div>
    </div>

      {/* Heavy, because the effect is not on this screen: it is on a sticker in
          a machine room across town, and the person who meets the consequence
          is not the person clicking. The three lines below are what actually
          happens, named before the button that does it is offered. */}
      <ConfirmDialog
        open={confirmingRegenerate}
        weight="heavy"
        title={t("qrLabels.regenerateFor", { name: elevator.registration_number })}
        body={t("qrLabels.regenerateBody")}
        consequences={[
          t("qrLabels.regenerateConsequenceLabels"),
          t("qrLabels.regenerateConsequenceWall"),
          t("qrLabels.regenerateConsequenceReprint"),
        ]}
        confirmLabel={regenerate.isPending ? t("qrLabels.regenerating") : t("qr.regenerate")}
        onConfirm={() => {
          regenerate.mutate();
          setConfirmingRegenerate(false);
        }}
        onCancel={() => setConfirmingRegenerate(false)}
      />
    </>
  );
}
