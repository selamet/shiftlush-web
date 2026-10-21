import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Phone, Siren } from "lucide-react";
import { errorMessage, supportReference } from "@/api/errors";
import {
  portalElevatorsQuery,
  portalFaultsQuery,
  portalKeys,
  portalReportFault,
  type PortalElevator,
  type PortalFault,
} from "@/api/portal-queries";
import { formatDateTime } from "@/lib/format";
import { useIdempotencyKey } from "@/lib/form";
import { isOpenFault } from "@/lib/portal";
import { ListError, TableSkeleton } from "@/components/list/ListStates";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { FaultStatusChip } from "@/components/ui/status-chip";

/** The emergency services' number — not the firm's. */
const EMERGENCY_NUMBER = "112";

/**
 * The customer's faults, and the form to report one.
 *
 * The form first, because a manager who came here usually came to report
 * something; the list below says what happened to the ones already reported.
 * "Somebody is trapped" is a checkbox of its own, and ticking it puts the
 * emergency number on screen in the heaviest treatment there is: the firm is
 * told at once, but a person stuck in a lift needs 112 as well.
 */
export function PortalFaultsScreen() {
  const { t } = useTranslation();
  const search = useSearch({ strict: false }) as { elevator?: unknown };
  const lifts = useQuery(portalElevatorsQuery());
  const faults = useQuery(portalFaultsQuery());
  // A fresh form — and with it a fresh idempotency key — after each report.
  const [formKey, setFormKey] = useState(0);
  const [lastReference, setLastReference] = useState("");

  const preselected = typeof search.elevator === "string" ? search.elevator : "";
  const all = faults.data?.results ?? [];
  const open = all.filter((fault) => isOpenFault(fault.status));
  const past = all.filter((fault) => !isOpenFault(fault.status));

  return (
    <>
      <h1 className="text-title">{t("portal.faults.title")}</h1>

      {lastReference && (
        <Alert tone="success" block title={t("portal.faults.received", { reference: lastReference })} />
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-card p-4">
        <h2 className="text-cardtitle">{t("portal.faults.report")}</h2>
        {lifts.isPending ? (
          <p className="text-help text-subtle">{t("common.loading")}</p>
        ) : lifts.isError ? (
          <p className="text-help text-destructive">{errorMessage(lifts.error, t)}</p>
        ) : (
          <ReportForm
            key={formKey}
            lifts={lifts.data.results}
            preselected={preselected}
            onReported={(fault) => {
              setLastReference(fault.reference);
              setFormKey((value) => value + 1);
            }}
          />
        )}
      </section>

      {faults.isPending ? (
        <TableSkeleton columns={1} rows={3} />
      ) : faults.isError ? (
        <ListError
          message={errorMessage(faults.error, t)}
          reference={supportReference(faults.error)}
          onRetry={() => void faults.refetch()}
        />
      ) : (
        <>
          <FaultList title={t("portal.faults.open")} empty={t("portal.faults.noOpen")} rows={open} />
          <FaultList title={t("portal.faults.past")} empty={t("portal.faults.noPast")} rows={past} />
        </>
      )}
    </>
  );
}

function ReportForm({
  lifts,
  preselected,
  onReported,
}: {
  lifts: PortalElevator[];
  preselected: string;
  onReported: (fault: PortalFault) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // One key per form: a second press after a dropped connection is the same
  // report, not a second one.
  const idempotencyKey = useIdempotencyKey();
  const [trapped, setTrapped] = useState(false);

  const report = useMutation({
    mutationFn: (body: Parameters<typeof portalReportFault>[0]) => portalReportFault(body, idempotencyKey),
    onSuccess: async (fault) => {
      await queryClient.invalidateQueries({ queryKey: portalKeys.all });
      onReported(fault);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        report.mutate({
          elevator: String(form.get("elevator") ?? ""),
          description: String(form.get("description") ?? "").trim(),
          someone_trapped: trapped,
          elevator_stopped: form.has("elevator_stopped"),
        });
      }}
    >
      {report.isError && <Alert tone="error" block title={errorMessage(report.error, t)} />}

      <Field label={t("portal.faults.lift")} htmlFor="portal-fault-lift" required>
        <select
          name="elevator"
          required
          defaultValue={preselected || (lifts.length === 1 ? lifts[0].id : "")}
          className="h-control-lg w-full rounded-md border border-input bg-card px-3 text-body focus-ring"
        >
          <option value="">{t("portal.faults.selectLift")}</option>
          {lifts.map((lift) => (
            <option key={lift.id} value={lift.id}>
              {lift.name} · {lift.building_name}
            </option>
          ))}
        </select>
      </Field>

      <label className="flex min-h-control-xl items-center gap-3 rounded-lg border-2 border-border p-3 text-body has-[:checked]:border-foreground">
        <input
          type="checkbox"
          checked={trapped}
          onChange={(event) => setTrapped(event.target.checked)}
          className="size-6 shrink-0 accent-primary"
        />
        <span className="text-cardtitle">{t("portal.faults.someoneTrapped")}</span>
      </label>

      {trapped && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border-2 border-foreground bg-foreground p-4 text-background">
          <p className="flex items-start gap-2 text-cardtitle">
            <Siren className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            {t("portal.faults.callEmergency", { number: EMERGENCY_NUMBER })}
          </p>
          <a
            href={`tel:${EMERGENCY_NUMBER}`}
            className="inline-flex min-h-control-xl items-center justify-center gap-2 rounded-md bg-background px-4 text-cardtitle font-semibold text-foreground focus-ring"
          >
            <Phone className="size-5" aria-hidden="true" />
            {t("portal.faults.callButton", { number: EMERGENCY_NUMBER })}
          </a>
        </div>
      )}

      <label className="flex min-h-control-lg items-center gap-3 rounded-lg border border-border p-3 text-body">
        <input type="checkbox" name="elevator_stopped" className="size-5 shrink-0 accent-primary" />
        {t("portal.faults.elevatorStopped")}
      </label>

      <Field label={t("portal.faults.description")} htmlFor="portal-fault-description" required>
        <Textarea name="description" rows={4} required maxLength={1000} placeholder={t("portal.faults.descriptionPlaceholder")} />
      </Field>

      <Button type="submit" size="lg" disabled={report.isPending}>
        {report.isPending ? t("common.sending") : t("portal.faults.submit")}
      </Button>
    </form>
  );
}

function FaultList({ title, empty, rows }: { title: string; empty: string; rows: PortalFault[] }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-cardtitle">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-help text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((fault) => (
            <li key={fault.id} className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-cell font-medium">{fault.elevator_name}</span>
                  <span className="font-mono tnum text-help text-muted-foreground">{fault.reference}</span>
                </span>
                <FaultStatusChip value={fault.status} />
              </div>
              <p className="break-words text-body">{fault.description}</p>
              <p className="text-help text-muted-foreground">
                {t("portal.faults.reportedAt", { at: formatDateTime(fault.reported_at) })}
                {fault.technician_first_name && ` · ${t("portal.faults.technician", { name: fault.technician_first_name })}`}
              </p>
              {fault.resolution_notes && (
                <p className="flex items-start gap-1.5 text-help">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                  {fault.resolution_notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
