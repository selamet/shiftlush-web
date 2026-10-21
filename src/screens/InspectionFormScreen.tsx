import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  createInspection,
  elevatorKeys,
  elevatorQuery,
  inspectionKeys,
  inspectionListQuery,
  updateInspection,
  type Inspection,
  type InspectionCreate,
} from "@/api/queries";
import type { InspectionKind, InspectionResultLabel } from "@/api/enums";
import { toDisplay, todayIso } from "@/lib/date";
import { formValues, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { SearchableSelect, enumOptions } from "@/components/ui/searchable-select";
import { useSession } from "@/lib/session";
import {
  INSPECTION_KINDS,
  INSPECTION_LABELS,
  canRecordInspections,
  defaultNextInspection,
  previewCorrectionDeadline,
} from "@/lib/inspections";
import { uploadAttachment, uploadRefusal } from "@/lib/upload";
import { describeUploadFailure } from "@/components/attachments/AttachmentsPanel";
import { DetailSkeleton, DetailError } from "@/components/list/ListStates";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";

const DRAWN = new Set([
  "kind",
  "follows",
  "inspected_on",
  "inspection_body",
  "report_number",
  "label",
  "next_inspection_due",
  "nonconformities",
]);

interface Defect {
  key: string;
  description: string;
  severity: InspectionResultLabel;
}

/**
 * Recording what the inspector's report says, for one lift.
 *
 * The office copies the report in: the day, the body that inspected, the
 * report number, the label, and each defect. The deadline is not asked for —
 * the server derives it from the label — but it is shown, from the same table
 * the server uses, before saving, because "a red label means sixty days and a
 * seal" is the thing the person typing most needs to see.
 *
 * A follow-up names the periodic inspection it follows, and the preview counts
 * from that one: the regulation allows no extensions, so fixing a defect never
 * buys more time.
 *
 * The PDF goes up after the record exists — an attachment needs something to
 * belong to — and is then linked as the inspection's report. If only the PDF
 * fails, the inspection is saved and the screen says so, with a retry.
 */
export function InspectionFormScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();
  const elevatorId = id ?? "";
  const allowed = canRecordInspections(role);

  const elevator = useQuery({ ...elevatorQuery(elevatorId), enabled: allowed && Boolean(elevatorId) });

  if (!allowed) return <PlanRestricted titleKey="inspection.recordRestricted" />;
  if (elevator.isPending) return <DetailSkeleton />;
  if (elevator.isError || !elevator.data) {
    return (
      <DetailError error={elevator.error} onRetry={() => void elevator.refetch()} back={{ to: "/elevators", labelKey: "elevator.title" }} />
    );
  }

  const lift = elevator.data;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/elevators/$id" params={{ id: lift.id }} className="hover:underline">
            {lift.name}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{t("inspection.record")}</span>
        </nav>
        <h1 className="text-title">{t("inspection.record")}</h1>
        <p className="text-help text-muted-foreground">
          {lift.name} · <span className="font-mono tnum">{lift.registration_number}</span> · {lift.building_name}
        </p>
      </div>
      <InspectionForm elevatorId={lift.id} />
    </div>
  );
}

function InspectionForm({ elevatorId }: { elevatorId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<InspectionKind>("periodic");
  const [follows, setFollows] = useState("");
  const [inspectedOn, setInspectedOn] = useState(() => todayIso());
  const [nextDue, setNextDue] = useState("");
  const [label, setLabel] = useState<InspectionResultLabel | undefined>(undefined);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [report, setReport] = useState<File | null>(null);
  const [reportNotice, setReportNotice] = useState("");
  // The record, once it exists — the PDF step may still be ahead of it.
  const [saved, setSaved] = useState<Inspection | null>(null);
  const [linkError, setLinkError] = useState("");
  const [linking, setLinking] = useState(false);

  const periodics = useQuery(
    inspectionListQuery({ elevator: elevatorId, kind: "periodic", ordering: "-inspected_on", page_size: 20 }),
  );
  const followed = (periodics.data?.results ?? []).find((one) => one.id === follows);

  const preview = previewCorrectionDeadline({
    label,
    kind,
    inspectedOn,
    follows: followed ? { inspected_on: followed.inspected_on, next_inspection_due: followed.next_inspection_due } : null,
    nextInspectionDue: nextDue,
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: inspectionKeys.all }),
      queryClient.invalidateQueries({ queryKey: elevatorKeys.all }),
    ]);
  }

  /** Upload the PDF and link it as the report. Retried by the button below on failure. */
  async function attachReport(inspection: Inspection, file: File) {
    setLinking(true);
    setLinkError("");
    try {
      const attachment = await uploadAttachment({
        objectType: "inspection",
        objectId: inspection.id,
        category: "inspection_report",
        file,
        // One file, one intention: the same key on a retry of this PDF.
        idempotencyKey: `${inspection.id}:report`,
      });
      await updateInspection(inspection.id, { report: attachment.id });
      await invalidate();
      void navigate({ to: "/elevators/$id", params: { id: elevatorId } });
    } catch (error) {
      setLinkError(describeUploadFailure(error, t));
    } finally {
      setLinking(false);
    }
  }

  const { submit, state } = useSubmit<InspectionCreate, Inspection>({
    mutationFn: createInspection,
    invalidate: [inspectionKeys.all, elevatorKeys.all],
    onSuccess: (inspection) => {
      if (report) {
        setSaved(inspection);
        void attachReport(inspection, report);
        return;
      }
      void navigate({ to: "/elevators/$id", params: { id: elevatorId } });
    },
  });

  if (saved) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" block title={t("inspection.saved")}>
          {linking && <p>{t("inspection.reportUploading")}</p>}
        </Alert>
        {linkError && (
          <>
            <Alert tone="warning" block title={t("inspection.reportFailed")}>
              <p>{linkError}</p>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" disabled={linking} onClick={() => report && void attachReport(saved, report)}>
                {t("common.retry")}
              </Button>
              <Link
                to="/elevators/$id"
                params={{ id: elevatorId }}
                className={buttonVariants({ size: "lg", variant: "secondary" })}
              >
                {t("inspection.backToElevator")}
              </Link>
            </div>
          </>
        )}
      </div>
    );
  }

  const orphaned = Object.entries(state.fields)
    .filter(([field]) => !DRAWN.has(field))
    .map(([, message]) => message);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!label) return;
        const values = formValues(event.currentTarget);
        const body: InspectionCreate = {
          elevator: elevatorId,
          kind,
          inspected_on: inspectedOn,
          label,
        };
        if (kind === "follow_up" && follows) body.follows = follows;
        if (values.inspection_body) body.inspection_body = values.inspection_body;
        if (values.report_number) body.report_number = values.report_number;
        if (nextDue) body.next_inspection_due = nextDue;
        const listed = defects
          .map((defect) => ({ description: defect.description.trim(), severity: defect.severity }))
          .filter((defect) => defect.description);
        if (listed.length > 0) body.nonconformities = listed;
        submit(body);
      }}
    >
      {(state.message || orphaned.length > 0) && (
        <Alert tone="error" block title={state.message || orphaned[0]}>
          {state.reference && (
            <p className="text-help">
              {t("errors.requestIdLabel")}: <span className="font-mono">{state.reference}</span>
            </p>
          )}
        </Alert>
      )}

      <Segmented
        name="kind"
        label={t("inspection.fields.kind")}
        options={INSPECTION_KINDS.map((value) => ({ value, label: enumLabel("inspection.kind", value) }))}
        value={kind}
        onChange={setKind}
      />

      {kind === "follow_up" && (
        <Field
          label={t("inspection.fields.follows")}
          htmlFor="inspection-follows"
          required
          hint={t("inspection.followsHint")}
          error={state.fields.follows}
          bindChild={false}
        >
          <SearchableSelect
            id="inspection-follows"
            value={follows}
            required
            onChange={setFollows}
            placeholder={t("inspection.selectFollows")}
            invalid={Boolean(state.fields.follows)}
            aria-describedby={state.fields.follows ? "inspection-follows-error" : "inspection-follows-hint"}
            options={(periodics.data?.results ?? []).map((one) => ({
              value: one.id,
              label: `${toDisplay(one.inspected_on)} · ${enumLabel("elevator.inspectionLabel", one.label)}`,
              // Searchable by the report number, which is what is on the paper.
              hint: one.report_number || undefined,
            }))}
          />
        </Field>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t("inspection.fields.inspectedOn")}
          htmlFor="inspection-date"
          required
          error={state.fields.inspected_on}
          bindChild={false}
        >
          <DatePicker
            id="inspection-date"
            value={inspectedOn}
            onChange={setInspectedOn}
            max={todayIso()}
            required
            invalid={Boolean(state.fields.inspected_on)}
          />
        </Field>
        <Field
          label={t("inspection.fields.nextDue")}
          htmlFor="inspection-next"
          hint={
            kind === "follow_up"
              ? t("inspection.nextDueHintFollowUp")
              : t("inspection.nextDueHint", { date: toDisplay(defaultNextInspection(inspectedOn)) })
          }
          error={state.fields.next_inspection_due}
          bindChild={false}
        >
          <DatePicker id="inspection-next" value={nextDue} onChange={setNextDue} invalid={Boolean(state.fields.next_inspection_due)} />
        </Field>
        <Field label={t("inspection.fields.body")} htmlFor="inspection-body" error={state.fields.inspection_body}>
          <Input name="inspection_body" maxLength={150} />
        </Field>
        <Field label={t("inspection.fields.reportNumber")} htmlFor="inspection-number" error={state.fields.report_number}>
          <Input name="report_number" maxLength={60} />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* No preselected label: recording "green" because nobody changed the
            default would be a clean bill of health nobody gave. */}
        <Segmented
          name="label"
          label={t("inspection.fields.label")}
          options={INSPECTION_LABELS.map((value) => ({
            value,
            label: enumLabel("elevator.inspectionLabel", value),
            tone: value === "red" || value === "yellow" ? "warning" : "default",
          }))}
          value={label}
          onChange={setLabel}
        />
        {state.fields.label && <p className="text-help text-destructive">{state.fields.label}</p>}
      </div>

      {preview && <DeadlinePreview preview={preview} />}

      <section className="flex flex-col gap-2" aria-labelledby="inspection-defects">
        <h2 id="inspection-defects" className="text-cardtitle">
          {t("inspection.nonconformities")}
        </h2>
        {defects.length === 0 && <p className="text-help text-muted-foreground">{t("inspection.noDefects")}</p>}
        <ol className="flex flex-col gap-2">
          {defects.map((defect, index) => (
            <li key={defect.key} className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
              <div className="flex items-start gap-2">
                <label htmlFor={`defect-${defect.key}`} className="sr-only">
                  {t("inspection.defectLabel", { index: index + 1 })}
                </label>
                <Textarea
                  id={`defect-${defect.key}`}
                  rows={2}
                  maxLength={2000}
                  value={defect.description}
                  placeholder={t("inspection.defectPlaceholder")}
                  onChange={(event) =>
                    setDefects((current) =>
                      current.map((one) => (one.key === defect.key ? { ...one, description: event.target.value } : one)),
                    )
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("inspection.removeDefect", { index: index + 1 })}
                  onClick={() => setDefects((current) => current.filter((one) => one.key !== defect.key))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
              <span className="flex flex-wrap items-center gap-2 text-help text-muted-foreground">
                <label htmlFor={`defect-severity-${defect.key}`}>{t("inspection.severity")}</label>
                <SearchableSelect
                  id={`defect-severity-${defect.key}`}
                  size="sm"
                  className="w-40"
                  value={defect.severity}
                  onChange={(next) => {
                    if (!next) return;
                    setDefects((current) =>
                      current.map((one) =>
                        one.key === defect.key ? { ...one, severity: next as InspectionResultLabel } : one,
                      ),
                    );
                  }}
                  options={enumOptions(INSPECTION_LABELS, (value) => enumLabel("elevator.inspectionLabel", value))}
                />
              </span>
            </li>
          ))}
        </ol>
        {state.fields.nonconformities && <p className="text-help text-destructive">{state.fields.nonconformities}</p>}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            setDefects((current) => [
              ...current,
              {
                key: crypto.randomUUID(),
                description: "",
                // A defect is as serious as the label it came with, until said otherwise.
                severity: label && label !== "green" ? label : "blue",
              },
            ])
          }
        >
          <Plus aria-hidden="true" />
          {t("inspection.addDefect")}
        </Button>
      </section>

      <Field label={t("inspection.fields.report")} htmlFor="inspection-report" hint={t("inspection.reportHint")} bindChild={false}>
        <input
          id="inspection-report"
          type="file"
          accept="application/pdf"
          className="text-body file:mr-3 file:h-control-sm file:rounded-md file:border file:border-border file:bg-card file:px-3 file:text-body"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setReportNotice("");
            if (file && uploadRefusal(file, ["application/pdf"])) {
              setReportNotice(t("inspection.reportRefused"));
              setReport(null);
              event.target.value = "";
              return;
            }
            setReport(file);
          }}
        />
      </Field>
      {reportNotice && <p className="-mt-3 text-help text-destructive">{reportNotice}</p>}

      <div className="flex flex-col gap-2">
        {!label && <p className="text-help text-muted-foreground">{t("inspection.labelRequired")}</p>}
        <Button type="submit" size="lg" className="self-start" disabled={!label || state.pending}>
          {state.pending ? t("common.saving") : t("inspection.save")}
        </Button>
      </div>
    </form>
  );
}

function DeadlinePreview({ preview }: { preview: NonNullable<ReturnType<typeof previewCorrectionDeadline>> }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border p-3 ${preview.sealedIfMissed ? "border-2 border-foreground" : "border-border"}`}
    >
      <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5">
        <p className="text-cell font-medium">
          {preview.deadline === null
            ? t("inspection.preview.none")
            : preview.basis === "next_inspection"
              ? t("inspection.preview.nextInspection", { date: toDisplay(preview.deadline) })
              : t("inspection.preview.days", {
                  date: toDisplay(preview.deadline),
                  days: preview.days,
                  from: toDisplay(preview.countedFrom),
                })}
        </p>
        {!preview.usable && <p className="text-help font-medium">{t("inspection.notUsable")}</p>}
        {preview.sealedIfMissed && <p className="text-help">{t("inspection.preview.sealed")}</p>}
        <p className="text-help text-muted-foreground">{t("inspection.preview.serverDecides")}</p>
      </div>
    </div>
  );
}
