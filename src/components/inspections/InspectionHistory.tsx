import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileDown, ShieldAlert, Wrench } from "lucide-react";
import {
  attachmentDownloadUrl,
  elevatorKeys,
  faultKeys,
  inspectionKeys,
  inspectionListQuery,
  openFaultForNonConformity,
  updateNonConformity,
  type Inspection,
  type NonConformity,
} from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { toDisplay, todayIso } from "@/lib/date";
import { enumLabel } from "@/lib/i18n";
import { openSignedUrl } from "@/lib/open-signed-url";
import { elevatorInspectionParams } from "@/lib/inspections";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { InspectionLabel } from "@/components/ui/inspection-label";
import { StatusChip } from "@/components/ui/status-chip";

/**
 * Everything that moves when a defect or an inspection changes: the history,
 * the due list, the lift (its label and dates are the latest inspection's),
 * and the fault board when a fault is opened.
 */
function useInspectionMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inspectionKeys.all }),
        queryClient.invalidateQueries({ queryKey: elevatorKeys.all }),
        queryClient.invalidateQueries({ queryKey: faultKeys.all }),
      ]);
    },
  });
}

/**
 * The lift's inspections, newest first, with what each one found.
 *
 * At the top, when there is one, the deadline that matters today: the current
 * inspection's correction date and the days left, with the seal named if the
 * label is one the municipality seals for. Below, each inspection with its
 * label, who inspected, the report number and PDF, and its defects — each
 * with its status, the fault opened for it, and for the office the two things
 * to do about it: record it fixed, or open a fault so the repair is tracked.
 *
 * Read-only for technicians: the matrix lets them read inspections, not
 * change them.
 */
export function InspectionHistory({
  elevatorId,
  canWrite,
  compact,
}: {
  elevatorId: string;
  canWrite: boolean;
  /** The phone view: the latest inspection only, with a count of the rest. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const query = useQuery(inspectionListQuery(elevatorInspectionParams(elevatorId)));

  if (query.isPending) return <p className="text-help text-subtle">{t("common.loading")}</p>;
  if (query.isError) return <p className="text-help text-destructive">{errorMessage(query.error, t)}</p>;

  const all = query.data.results;
  const current = all[0];
  const shown = compact ? all.slice(0, 1) : all;

  return (
    <div className="flex flex-col gap-3">
      {current?.correction_deadline && current.days_left !== null && (
        <CurrentDeadline inspection={current} />
      )}
      {all.length === 0 ? (
        <p className="text-help text-subtle">{t("inspection.historyEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {shown.map((inspection) => (
            <InspectionEntry key={inspection.id} inspection={inspection} canWrite={canWrite} />
          ))}
        </ol>
      )}
      {compact && all.length > 1 && (
        <p className="text-help text-muted-foreground">
          {t("inspection.moreOnDesktop", { count: all.length - 1 })}
        </p>
      )}
    </div>
  );
}

function CurrentDeadline({ inspection }: { inspection: Inspection }) {
  const { t } = useTranslation();
  const days = inspection.days_left ?? 0;
  const passed = days < 0;
  const openCount = inspection.nonconformities.filter((one) => one.status === "open").length;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3",
        passed && inspection.sealed_if_missed ? "border-2 border-foreground" : "border-border",
      )}
    >
      <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="text-cell font-medium">
          {t("inspection.correctionBy", { date: toDisplay(inspection.correction_deadline) })}
        </p>
        <p className="tnum text-help">
          {passed ? t("inspection.daysPassed", { count: -days }) : t("inspection.daysLeft", { count: days })}
          {openCount > 0 && ` · ${t("inspection.openCount", { count: openCount })}`}
        </p>
        {inspection.sealed_if_missed && (
          <p className="text-help font-medium">
            {passed ? t("inspection.sealingRisk") : t("inspection.sealedIfMissed")}
          </p>
        )}
        {!inspection.lift_usable && <p className="text-help font-medium">{t("inspection.notUsable")}</p>}
      </div>
    </div>
  );
}

function InspectionEntry({ inspection, canWrite }: { inspection: Inspection; canWrite: boolean }) {
  const { t } = useTranslation();
  const [downloadError, setDownloadError] = useState("");

  async function openReport(id: string) {
    setDownloadError("");
    try {
      await openSignedUrl(async () => (await attachmentDownloadUrl(id)).download_url);
    } catch (error) {
      setDownloadError(errorMessage(error, t));
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <InspectionLabel value={inspection.label} />
          <span className="tnum text-cell">{toDisplay(inspection.inspected_on)}</span>
          <span className="text-help text-muted-foreground">{enumLabel("inspection.kind", inspection.kind)}</span>
        </span>
        {inspection.report && (
          <Button size="xs" variant="secondary" onClick={() => void openReport(inspection.report as string)}>
            <FileDown aria-hidden="true" />
            {t("inspection.reportPdf")}
          </Button>
        )}
      </div>
      <p className="text-help text-muted-foreground">
        {[inspection.inspection_body, inspection.report_number && t("inspection.reportNo", { number: inspection.report_number })]
          .filter(Boolean)
          .join(" · ") || "—"}
      </p>
      {downloadError && <p className="text-help text-destructive">{downloadError}</p>}
      {inspection.nonconformities.length > 0 && (
        <ul className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle">
          {inspection.nonconformities.map((item) => (
            <NonConformityRow key={item.id} item={item} canWrite={canWrite} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * One defect. Its status in words; the fault, when one was opened, as a link;
 * and for the office, "mark fixed" with the day it was fixed, or "open a fault" to
 * send somebody — which takes the person straight to the new fault.
 */
function NonConformityRow({ item, canWrite }: { item: NonConformity; canWrite: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [fixing, setFixing] = useState(false);
  const [fixedOn, setFixedOn] = useState(() => todayIso());

  const markFixed = useInspectionMutation((day: string) =>
    updateNonConformity(item.id, { status: "fixed", fixed_on: day }),
  );
  const openFault = useInspectionMutation(() => openFaultForNonConformity(item.id));
  const failure = markFixed.error ?? openFault.error;

  return (
    <li className="flex flex-col gap-1.5 py-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="break-words text-cell">{item.description}</span>
          <span className="flex flex-wrap items-center gap-2 text-help text-muted-foreground">
            <InspectionLabel value={item.severity} />
            <StatusChip weight={item.status === "open" ? "outline" : "silent"} icon={item.status === "fixed" ? CheckCircle2 : undefined}>
              {enumLabel("inspection.nonconformityStatus", item.status)}
            </StatusChip>
            {item.fixed_on && <span className="tnum">{t("inspection.fixedOn", { date: toDisplay(item.fixed_on) })}</span>}
            {item.fault && (
              <Link to="/faults/$id" params={{ id: item.fault }} className="text-primary hover:underline">
                {t("inspection.linkedFault")}
              </Link>
            )}
          </span>
        </span>
        {canWrite && item.status === "open" && !fixing && (
          <span className="flex flex-wrap items-center gap-2">
            <Button size="xs" variant="secondary" onClick={() => setFixing(true)}>
              <CheckCircle2 aria-hidden="true" />
              {t("inspection.markFixed")}
            </Button>
            {!item.fault && (
              <Button
                size="xs"
                variant="ghost"
                disabled={openFault.isPending}
                onClick={() =>
                  openFault.mutate(undefined, {
                    onSuccess: (updated) => {
                      if (updated.fault) void navigate({ to: "/faults/$id", params: { id: updated.fault } });
                    },
                  })
                }
              >
                <Wrench aria-hidden="true" />
                {t("inspection.openFault")}
              </Button>
            )}
          </span>
        )}
      </div>
      {fixing && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (fixedOn) markFixed.mutate(fixedOn, { onSuccess: () => setFixing(false) });
          }}
        >
          <label htmlFor={`fixed-${item.id}`} className="text-help text-muted-foreground">
            {t("inspection.fixedOnLabel")}
          </label>
          <DatePicker id={`fixed-${item.id}`} value={fixedOn} onChange={setFixedOn} max={todayIso()} className="w-40" />
          <Button type="submit" size="xs" disabled={!fixedOn || markFixed.isPending}>
            {markFixed.isPending ? t("common.saving") : t("common.save")}
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setFixing(false)}>
            {t("common.cancel")}
          </Button>
        </form>
      )}
      {failure && <p className="text-help text-destructive">{errorMessage(failure, t)}</p>}
    </li>
  );
}

/** "Record an inspection" — the office's way in to the inspection form. */
export function RecordInspectionLink({ elevatorId, size = "sm" }: { elevatorId: string; size?: "sm" | "lg" }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/elevators/$id/inspections/new"
      params={{ id: elevatorId }}
      className={buttonVariants({ size, variant: "secondary" })}
    >
      {t("inspection.record")}
    </Link>
  );
}
