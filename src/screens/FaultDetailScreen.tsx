import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronRight,
  MapPin,
  Phone,
  QrCode,
  Siren,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  arriveAtFault,
  assignFault,
  cancelFault,
  closeFault,
  elevatorKeys,
  faultAttachmentsQuery,
  faultKeys,
  faultQuery,
  resolveFault,
  updateFault,
  visitTechniciansQuery,
  type Fault,
} from "@/api/queries";
import type { FaultPriority } from "@/api/enums";
import { errorMessage } from "@/api/errors";
import { formatDateTime, formatPhone, telHref } from "@/lib/format";
import { enumLabel } from "@/lib/i18n";
import { SearchableSelect, enumOptions } from "@/components/ui/searchable-select";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  FAULT_PRIORITIES,
  availableActions,
  canUseFaults,
  faultTimeline,
  formatDuration,
  isActive,
  isOffice,
} from "@/lib/faults";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { ResponseTimer } from "@/components/faults/ResponseTimer";
import { DetailSkeleton, DetailError } from "@/components/list/ListStates";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { FaultPriorityChip, FaultStatusChip } from "@/components/ui/status-chip";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-4 md:p-5">
      <h2 className="mb-2 text-cardtitle">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Every write on this page lands the same way: the fault changed, and the lift
 * may have — a fault that stopped a lift, resolved with "back in service",
 * moves the elevator's status too. So every action invalidates both.
 */
function useFaultMutation<TInput>(run: (input: TInput) => Promise<Fault>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: faultKeys.all }),
        queryClient.invalidateQueries({ queryKey: elevatorKeys.all }),
      ]);
    },
  });
}

/**
 * One fault: what was reported, what has happened since, and the next step.
 *
 * The next step is the point of the page. For a technician at the lift that is
 * one large button at the bottom of the screen — "arrived", then "resolved" —
 * and nothing else to aim past. For the office it is sending somebody,
 * checking the work and closing it, or cancelling a duplicate with a reason.
 * Which of those appear is decided in lib/faults from the role and the state,
 * so a button is never offered that the server would refuse.
 */
export function FaultDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role, userId } = useSession();
  const faultId = id ?? "";
  const allowed = canUseFaults(role);

  const query = useQuery({ ...faultQuery(faultId), enabled: allowed && Boolean(faultId) });
  const photos = useQuery({ ...faultAttachmentsQuery(faultId), enabled: allowed && Boolean(faultId) });
  const office = isOffice(role);
  const technicians = useQuery({ ...visitTechniciansQuery(), enabled: allowed && office });

  const [dialog, setDialog] = useState<"resolve" | "cancel" | "close" | null>(null);
  const [technician, setTechnician] = useState("");

  const arrive = useFaultMutation(() => arriveAtFault(faultId));
  const assign = useFaultMutation((who: string) => assignFault(faultId, who));
  const close = useFaultMutation(() => closeFault(faultId));
  const resolve = useFaultMutation((body: Parameters<typeof resolveFault>[1]) =>
    resolveFault(faultId, body),
  );
  const cancel = useFaultMutation((reason: string) => cancelFault(faultId, reason));
  const edit = useFaultMutation((body: Parameters<typeof updateFault>[1]) => updateFault(faultId, body));

  if (!allowed) return <PlanRestricted titleKey="fault.restricted" />;
  if (query.isPending) return <DetailSkeleton />;
  if (query.isError || !query.data) {
    return (
      <DetailError
        error={query.error}
        onRetry={() => void query.refetch()}
        // A technician comes here from their own list; the office from the board.
        back={role === "technician" ? { to: "/my-faults", labelKey: "fault.mine" } : { to: "/faults", labelKey: "fault.title" }}
        missingKey="fault.missing"
      />
    );
  }

  const fault = query.data;
  const actions = availableActions(fault, role, userId);
  const timeline = faultTimeline(fault);
  const mine = role === "technician" && fault.technician === userId;
  // Photos: the office on any fault, the technician on the one they are on.
  const canAddPhotos = (office || mine) && fault.status !== "cancelled";
  // The last failure of any action, said once above the buttons.
  const failed = [arrive, assign, close, edit].find((mutation) => mutation.isError);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-28 md:p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/faults" className="hover:underline">
            {office ? t("fault.title") : t("fault.titleTechnician")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="font-mono text-foreground">{fault.reference}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-title">
            {t("fault.detailTitle", { reference: fault.reference })}
          </h1>
          <FaultPriorityChip value={fault.priority} />
          <FaultStatusChip value={fault.status} />
        </div>
        <Link
          to="/elevators/$id"
          params={{ id: fault.elevator }}
          className="self-start text-body text-primary hover:underline"
        >
          {fault.elevator_name}
        </Link>
        <p className="text-help text-muted-foreground">
          {fault.building_name} · {fault.customer_name}
        </p>
      </div>

      {/* Somebody is in the car. Said in words with an icon, at the top, in
          the heaviest treatment the system has — not left to a red chip. */}
      {fault.priority === "emergency" && isActive(fault.status) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border-2 border-foreground bg-foreground p-4 text-background"
        >
          <Siren className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <p className="text-cardtitle">{t("fault.emergencyTitle")}</p>
            <p className="text-body">{t("fault.emergencyBody")}</p>
          </div>
        </div>
      )}
      {fault.stopped_elevator && isActive(fault.status) && (
        <Alert tone="warning" title={t("fault.stoppedNotice")} />
      )}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle sm:grid-cols-3">
        <Fact label={t("fault.fields.reportedAt")}>{formatDateTime(fault.reported_at)}</Fact>
        <Fact label={t("fault.fields.channel")}>
          <span className="inline-flex items-center gap-1">
            {fault.channel === "public_qr" && <QrCode className="size-3.5" aria-hidden="true" />}
            {enumLabel("fault.channel", fault.channel)}
          </span>
        </Fact>
        <Fact label={t("fault.fields.technician")}>
          {fault.technician_name || t("fault.nobodySent")}
        </Fact>
        <Fact label={t("fault.fields.responseTime")}>
          <ResponseTimer fault={fault} />
        </Fact>
        <Fact label={t("fault.fields.resolutionTime")}>
          {fault.resolution_time_seconds === null
            ? "—"
            : formatDuration(fault.resolution_time_seconds, t)}
        </Fact>
        <Fact label={t("fault.fields.billable")}>
          <BillableValue fault={fault} />
        </Fact>
      </section>

      <Section title={t("fault.fields.description")}>
        <p className="whitespace-pre-wrap break-words text-body">{fault.description}</p>
        {/* The resident who reported it, so the office can call them back. A
            tel: link, because the office is often on a phone already. */}
        {(fault.reporter_name || fault.reporter_phone) && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-help text-muted-foreground">
            <span>{t("fault.reporter")}:</span>
            {fault.reporter_name && <span className="text-foreground">{fault.reporter_name}</span>}
            {fault.reporter_phone && (
              <a href={telHref(fault.reporter_phone)} className="inline-flex items-center gap-1 text-primary hover:underline">
                <Phone className="size-3.5" aria-hidden="true" />
                {formatPhone(fault.reporter_phone)}
              </a>
            )}
          </p>
        )}
        {fault.additional_reports.length > 0 && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
            <p className="text-label">
              {t("fault.additionalReports", { count: fault.additional_reports.length })}
            </p>
            <ul className="flex flex-col gap-1.5">
              {fault.additional_reports.map((report, index) => (
                <li key={index} className="text-help text-muted-foreground">
                  <span className="tnum">
                    {typeof report.reported_at === "string" ? formatDateTime(report.reported_at) : ""}
                  </span>
                  {" — "}
                  {typeof report.description === "string" ? report.description : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title={t("fault.timeline")}>
        <ol className="flex flex-col">
          {timeline.map((entry) => (
            <li
              key={entry.step}
              className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-2 last:border-0"
            >
              <span className="flex flex-col leading-tight">
                <span className="text-cell">{t(`fault.step.${entry.step}`)}</span>
                {entry.who && <span className="text-help text-muted-foreground">{entry.who}</span>}
              </span>
              <time dateTime={entry.at} className="tnum shrink-0 text-help text-muted-foreground">
                {formatDateTime(entry.at)}
              </time>
            </li>
          ))}
        </ol>
        {fault.status === "cancelled" && fault.cancel_reason && (
          <p className="mt-2 text-help text-muted-foreground">
            {t("fault.cancelReason")}: {fault.cancel_reason}
          </p>
        )}
      </Section>

      {(fault.resolution_notes || fault.parts_used) && (
        <Section title={t("fault.resolution")}>
          {fault.resolution_notes && (
            <p className="whitespace-pre-wrap break-words text-body">{fault.resolution_notes}</p>
          )}
          {fault.parts_used && (
            <p className="mt-2 text-help text-muted-foreground">
              {t("fault.fields.partsUsed")}: {fault.parts_used}
            </p>
          )}
        </Section>
      )}

      {actions.includes("edit") && (
        <Section title={t("fault.officeCorrections")}>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2 text-body">
              <label htmlFor="fault-priority">{t("fault.fields.priority")}</label>
              <SearchableSelect
                id="fault-priority"
                className="w-44"
                value={fault.priority}
                disabled={edit.isPending}
                onChange={(next) => {
                  if (next && next !== fault.priority) edit.mutate({ priority: next as FaultPriority });
                }}
                options={enumOptions(FAULT_PRIORITIES, (value) => enumLabel("fault.priority", value))}
              />
            </span>
            {/* The office's say over the invoice. Ticking it states the value
                outright, which the server records as an override and keeps
                even when resolving would have derived something else. */}
            <label className="flex min-h-control-md items-center gap-2 text-body">
              <input
                type="checkbox"
                checked={fault.billable === true}
                disabled={edit.isPending}
                onChange={(event) => edit.mutate({ billable: event.target.checked })}
                className="size-4 accent-primary focus-ring"
              />
              {t("fault.billableToggle")}
            </label>
          </div>
        </Section>
      )}

      <Section title={t("fault.photos")}>
        <AttachmentsPanel
          objectType="fault"
          objectId={fault.id}
          attachments={photos.data?.results ?? []}
          invalidateKey={faultKeys.attachments(fault.id)}
          canWrite={canAddPhotos}
          fixedCategory="photo"
          capture="environment"
        />
      </Section>

      {/* The next step, pinned where the thumb is on a phone. */}
      {actions.some((action) => action !== "edit") && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-card p-3 md:static md:rounded-lg md:border">
          {failed && <Alert tone="error" block title={errorMessage(failed.error, t)} />}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {actions.includes("arrive") && (
              <Button size="xl" disabled={arrive.isPending} onClick={() => arrive.mutate(undefined)}>
                <MapPin />
                {arrive.isPending ? t("common.saving") : t("fault.actions.arrive")}
              </Button>
            )}
            {actions.includes("resolve") && (
              <Button size="xl" onClick={() => setDialog("resolve")}>
                <CheckCircle2 />
                {t("fault.actions.resolve")}
              </Button>
            )}
            {actions.includes("close") && (
              <Button size="lg" onClick={() => setDialog("close")}>
                <CheckCircle2 />
                {t("fault.actions.close")}
              </Button>
            )}
            {actions.includes("assign") && (
              <span className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="fault-assign">
                  {t("fault.fields.technician")}
                </label>
                <SearchableSelect
                  id="fault-assign"
                  className="w-56"
                  value={technician}
                  onChange={setTechnician}
                  placeholder={t("fault.selectTechnician")}
                  options={(technicians.data ?? []).map((one) => ({ value: one.id, label: one.name }))}
                />
                <Button
                  size="lg"
                  variant={fault.status === "open" ? "primary" : "secondary"}
                  disabled={!technician || assign.isPending}
                  onClick={() => assign.mutate(technician, { onSuccess: () => setTechnician("") })}
                >
                  <UserPlus />
                  {fault.status === "open" ? t("fault.actions.assign") : t("fault.actions.reassign")}
                </Button>
              </span>
            )}
            {actions.includes("cancel") && (
              <Button size="lg" variant="ghost" onClick={() => setDialog("cancel")}>
                <XCircle />
                {t("fault.actions.cancel")}
              </Button>
            )}
          </div>
        </div>
      )}

      {dialog === "resolve" && (
        <ResolveDialog
          fault={fault}
          pending={resolve.isPending}
          error={resolve.error}
          onCancel={() => {
            resolve.reset();
            setDialog(null);
          }}
          onSubmit={(body) => resolve.mutate(body, { onSuccess: () => setDialog(null) })}
        />
      )}
      {dialog === "cancel" && (
        <CancelDialog
          pending={cancel.isPending}
          error={cancel.error}
          onCancel={() => {
            cancel.reset();
            setDialog(null);
          }}
          onSubmit={(reason) => cancel.mutate(reason, { onSuccess: () => setDialog(null) })}
        />
      )}
      <ConfirmDialog
        open={dialog === "close"}
        title={t("fault.closeTitle", { reference: fault.reference })}
        body={t("fault.closeBody")}
        confirmLabel={t("fault.actions.close")}
        onConfirm={() => {
          close.mutate(undefined);
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 bg-card p-3">
      <span className="text-help text-muted-foreground">{label}</span>
      <span className="text-body">{children}</span>
    </div>
  );
}

/** Billable or not — and, when the office stated it, that it was stated by hand. */
function BillableValue({ fault }: { fault: Fault }) {
  const { t } = useTranslation();
  const value =
    fault.billable === null
      ? t("fault.billableUnknown")
      : fault.billable
        ? t("fault.billableYes")
        : t("fault.billableNo");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {value}
      {fault.billable_overridden && (
        <span className="rounded-sm border border-dashed border-border-strong px-1.5 text-help text-muted-foreground">
          {t("fault.billableOverridden")}
        </span>
      )}
    </span>
  );
}

/**
 * "resolved": what was done, what was fitted, and — when the fault stopped the
 * lift — whether it goes back into service. That last one is asked, not
 * assumed: a lift fixed for now but waiting on a part stays out of service,
 * and only the person standing at it knows which.
 */
function ResolveDialog({
  fault,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  fault: Fault;
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (body: { resolution_notes: string; parts_used: string; restore_service: boolean }) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open onClose={onCancel} label={t("fault.resolveTitle")} className="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            resolution_notes: String(form.get("resolution_notes") ?? "").trim(),
            parts_used: String(form.get("parts_used") ?? "").trim(),
            restore_service: form.has("restore_service"),
          });
        }}
      >
        <h2 className="text-cardtitle">{t("fault.resolveTitle")}</h2>
        {Boolean(error) && <Alert tone="error" block title={errorMessage(error, t)} />}
        <Field label={t("fault.fields.resolutionNotes")} htmlFor="fault-notes" hint={t("fault.resolutionNotesHint")}>
          <Textarea name="resolution_notes" rows={3} />
        </Field>
        <Field label={t("fault.fields.partsUsed")} htmlFor="fault-parts">
          <Textarea name="parts_used" rows={2} />
        </Field>
        {fault.stopped_elevator && (
          <label className="flex min-h-control-lg items-center gap-3 rounded-md border border-border p-3 text-body">
            <input type="checkbox" name="restore_service" defaultChecked className="size-5 accent-primary" />
            {t("fault.restoreService")}
          </label>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="lg" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? t("common.saving") : t("fault.actions.resolve")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Cancelling needs a reason: the fault stays on the record, and so does why it was dropped. */
function CancelDialog({
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open onClose={onCancel} role="alertdialog" label={t("fault.cancelTitle")} className="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(String(new FormData(event.currentTarget).get("reason") ?? "").trim());
        }}
      >
        <h2 className="text-cardtitle">{t("fault.cancelTitle")}</h2>
        <p className="text-body text-muted-foreground">{t("fault.cancelBody")}</p>
        {Boolean(error) && <Alert tone="error" block title={errorMessage(error, t)} />}
        <Field label={t("fault.cancelReason")} htmlFor="fault-cancel-reason" required>
          <Textarea name="reason" rows={3} required maxLength={1000} />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="lg" onClick={onCancel}>
            {t("common.close")}
          </Button>
          <Button type="submit" size="lg" variant="destructive" disabled={pending} className={cn("min-w-32")}>
            {pending ? t("common.saving") : t("fault.actions.cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
