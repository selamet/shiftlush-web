import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Siren } from "lucide-react";
import {
  createFault,
  elevatorKeys,
  elevatorQuery,
  faultKeys,
  visitTechniciansQuery,
  type Fault,
  type FaultCreate,
} from "@/api/queries";
import type { FaultPriority } from "@/api/enums";
import { formValues, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useSession } from "@/lib/session";
import { FAULT_PRIORITIES, canUseFaults, isOffice, staffPriority } from "@/lib/faults";
import { DetailSkeleton, DetailError } from "@/components/list/ListStates";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";

/** Fields this form draws; an error naming any other is said at the top. */
const DRAWN = new Set(["description", "priority", "technician", "stopped_elevator"]);

/**
 * Recording a fault on one lift, from inside the firm.
 *
 * Usually a phone call: a building manager rings the office, or a technician
 * finds something on a round. The two questions that decide how fast somebody
 * goes are asked as plain checkboxes — is anybody trapped, has the lift
 * stopped — rather than left inside the priority: somebody trapped makes it an
 * emergency whatever the priority says, here and on the server, and the form
 * shows that instead of letting the two disagree.
 *
 * The office may send a technician in the same step; a technician reporting
 * a fault they found does not choose who goes, the office does.
 */
export function FaultCreateScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();
  const elevatorId = id ?? "";
  const allowed = canUseFaults(role);
  const office = isOffice(role);

  const elevator = useQuery({ ...elevatorQuery(elevatorId), enabled: allowed && Boolean(elevatorId) });
  const technicians = useQuery({ ...visitTechniciansQuery(), enabled: allowed && office });

  const [priority, setPriority] = useState<FaultPriority>("normal");
  const [trapped, setTrapped] = useState(false);

  const { submit, state } = useSubmit<FaultCreate, Fault>({
    mutationFn: createFault,
    // The elevator too: a fault that stops a lift changes its status.
    invalidate: [faultKeys.all, elevatorKeys.detail(elevatorId)],
    onSuccess: (fault) => void navigate({ to: "/faults/$id", params: { id: fault.id } }),
  });

  if (!allowed) return <PlanRestricted titleKey="fault.restricted" />;
  if (elevator.isPending) return <DetailSkeleton />;
  if (elevator.isError || !elevator.data) {
    return (
      <DetailError error={elevator.error} onRetry={() => void elevator.refetch()} back={{ to: "/elevators", labelKey: "elevator.title" }} />
    );
  }

  const lift = elevator.data;
  const effective = staffPriority(priority, trapped);
  const orphaned = Object.entries(state.fields)
    .filter(([field]) => !DRAWN.has(field))
    .map(([, message]) => message);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/elevators/$id" params={{ id: lift.id }} className="hover:underline">
            {lift.name}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{t("fault.report")}</span>
        </nav>
        <h1 className="text-title">{t("fault.report")}</h1>
        <p className="text-help text-muted-foreground">
          {lift.name} · <span className="font-mono tnum">{lift.registration_number}</span> ·{" "}
          {lift.building_name}
        </p>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const values = formValues(event.currentTarget);
          const body: FaultCreate = {
            elevator: lift.id,
            description: values.description ?? "",
            priority: effective,
            someone_trapped: trapped,
            stopped_elevator: values.stopped_elevator === "on",
          };
          if (office && values.technician) body.technician = values.technician;
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

        <Field
          label={t("fault.fields.description")}
          htmlFor="fault-description"
          required
          error={state.fields.description}
        >
          <Textarea name="description" rows={4} required invalid={Boolean(state.fields.description)} />
        </Field>

        {/* The two questions that decide the response, asked before the
            priority so the priority can follow from them. */}
        <div className="flex flex-col gap-2">
          <label className="flex min-h-control-lg items-center gap-3 rounded-md border border-border p-3 text-body">
            <input
              type="checkbox"
              checked={trapped}
              onChange={(event) => setTrapped(event.target.checked)}
              className="size-5 accent-primary"
            />
            <span className="font-medium">{t("fault.someoneTrapped")}</span>
          </label>
          <label className="flex min-h-control-lg items-center gap-3 rounded-md border border-border p-3 text-body">
            <input type="checkbox" name="stopped_elevator" className="size-5 accent-primary" />
            {t("fault.elevatorStopped")}
          </label>
        </div>

        {trapped ? (
          <div className="flex items-start gap-3 rounded-lg border-2 border-foreground p-3">
            <Siren className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p className="text-body">{t("fault.trappedMeansEmergency")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Segmented
              name="priority"
              label={t("fault.fields.priority")}
              options={FAULT_PRIORITIES.map((value) => ({
                value,
                label: enumLabel("fault.priority", value),
                tone: value === "emergency" ? "warning" : "default",
              }))}
              value={priority}
              onChange={setPriority}
            />
            {state.fields.priority && (
              <p className="text-help text-destructive">{state.fields.priority}</p>
            )}
          </div>
        )}

        {office && (
          <Field
            label={t("fault.sendNow")}
            htmlFor="fault-technician"
            hint={t("fault.sendNowHint")}
            error={state.fields.technician}
            bindChild={false}
          >
            {/* Optional: empty is "send later", said as the placeholder and
                restored by clearing. */}
            <SearchableSelect
              id="fault-technician"
              name="technician"
              clearable
              disabled={technicians.isPending}
              placeholder={t("fault.sendLater")}
              invalid={Boolean(state.fields.technician)}
              aria-describedby={state.fields.technician ? "fault-technician-error" : "fault-technician-hint"}
              options={(technicians.data ?? []).map((one) => ({ value: one.id, label: one.name }))}
            />
          </Field>
        )}

        <Button type="submit" size="xl" className="w-full md:w-auto md:self-start" disabled={state.pending}>
          {state.pending ? t("common.saving") : t("fault.reportSubmit")}
        </Button>
      </form>
    </div>
  );
}
