import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  buildingListQuery,
  createElevator,
  elevatorKeys,
  elevatorQuery,
  updateElevator,
  type Elevator,
  type ElevatorWrite,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { ALL_FIELDS, TABS, TAB_OF_FIELD, type FieldSpec } from "@/screens/elevator-form-fields";

function initialValue(record: Elevator | undefined, field: FieldSpec): string | boolean {
  if (!record) return field.kind === "checkbox" ? true : "";
  const value = (record as unknown as Record<string, unknown>)[field.name];
  if (field.kind === "checkbox") return value !== false;
  return value === null || value === undefined ? "" : String(value);
}

/**
 * The elevator record: thirty-one fields across six tabs.
 *
 * Every panel stays mounted and the tabs only change what is visible. That is
 * the whole reason this works: the inputs are uncontrolled, so unmounting a
 * panel would throw away everything typed on the tab being left — silently, and
 * noticed only after saving.
 *
 * Two things follow. Submit sends the entire record whichever tab is open. And
 * a server error on a hidden tab has to be counted there and reachable, or the
 * form refuses to save while showing nothing wrong.
 */
export function ElevatorFormScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id?: string };
  const search = useSearch({ strict: false }) as { building?: string };
  const editing = Boolean(id);

  const existing = useQuery({ ...elevatorQuery(id ?? ""), enabled: editing });
  const buildings = useQuery(buildingListQuery({ page_size: 100 }));
  const idempotencyKey = useIdempotencyKey();

  const [activeTab, setActiveTab] = useState(TABS[0].key);
  const [dirty, setDirty] = useState(false);
  const [filled, setFilled] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const { submit, state } = useSubmit<ElevatorWrite, Elevator>({
    mutationFn: (body) =>
      editing ? updateElevator(id as string, body) : createElevator(body, idempotencyKey),
    invalidate: [elevatorKeys.all],
    onSuccess: (elevator) => {
      setDirty(false);
      void navigate({ to: "/elevators/$id", params: { id: elevator.id } });
    },
  });

  /** Server errors grouped by tab, so each tab can say how many it holds. */
  const errorsByTab = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const name of Object.keys(state.fields)) {
      const tab = TAB_OF_FIELD[name];
      if (tab) counts[tab] = (counts[tab] ?? 0) + 1;
    }
    return counts;
  }, [state.fields]);

  const firstErrorTab = TABS.find((tab) => errorsByTab[tab.key])?.key;

  function recount() {
    if (!formRef.current) return;
    setFilled(Object.keys(formValues(formRef.current)).length);
    setDirty(true);
  }

  if (editing && existing.isPending) return <DetailSkeleton />;
  if (editing && (existing.isError || !existing.data)) {
    return (
      <ListError
        message={errorMessage(existing.error, t)}
        reference={supportReference(existing.error)}
        onRetry={() => void existing.refetch()}
      />
    );
  }

  const record = existing.data;
  const heading = editing ? record?.name || record?.registration_number : t("elevator.add");

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/elevators" className="hover:underline">
              {t("elevator.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{heading}</span>
          </nav>
          <h1 className="text-title">{heading}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Counted from what is actually in the inputs. The previous version
              printed a constant, which is worse than printing nothing: a number
              reads as a fact. */}
          <span className="tnum text-label text-muted-foreground">
            {t("form.fieldsFilled", { filled, total: ALL_FIELDS.length })}
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round((filled / ALL_FIELDS.length) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <form
        ref={formRef}
        className="flex flex-col"
        onChange={recount}
        onSubmit={(event) => {
          event.preventDefault();
          const values = formValues(event.currentTarget) as Record<string, unknown>;
          // An unchecked box is absent from FormData, and absent means "not
          // provided" rather than false. Whether a car has a door is a fact
          // about the lift, and its absence is the serious case.
          values.has_car_door = Boolean(
            (event.currentTarget.elements.namedItem("has_car_door") as HTMLInputElement)?.checked,
          );
          submit(values as ElevatorWrite);
        }}
      >
        {state.message && (
          <div className="px-6 pb-4">
            <Alert tone="error" block title={state.message}>
              {state.reference && (
                <p className="text-help">
                  {t("errors.requestIdLabel")}:{" "}
                  <span className="font-mono">{state.reference}</span>
                </p>
              )}
            </Alert>
          </div>
        )}

        {firstErrorTab && firstErrorTab !== activeTab && (
          <div className="mx-6 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border-l-[3px] border-destructive bg-destructive-bg px-3 py-2">
            <span className="text-label text-destructive">
              {t("form.errorOnOtherTab", {
                tab: t(TABS.find((tab) => tab.key === firstErrorTab)?.labelKey ?? ""),
              })}
            </span>
            {/* Without this the form refuses to save and shows nothing wrong,
                because the field that failed is on a tab nobody is looking at. */}
            <button
              type="button"
              onClick={() => setActiveTab(firstErrorTab)}
              className="ml-auto text-help text-destructive underline"
            >
              {t("form.goToError")}
            </button>
          </div>
        )}

        <div className="flex gap-1 overflow-x-auto border-b border-border px-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex h-control-md shrink-0 items-center gap-2 px-3 text-body transition-colors focus-ring",
                activeTab === tab.key
                  ? "border-b-2 border-primary font-medium text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(tab.labelKey)}
              {errorsByTab[tab.key] ? (
                <span className="tnum rounded-full bg-destructive px-1.5 text-help text-destructive-foreground">
                  {errorsByTab[tab.key]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="px-6 py-5">
          <Field
            label={t("building.singular")}
            htmlFor="ef-building"
            required
            error={state.fields.building}
            className="mb-5 max-w-md"
            bindChild={false}
          >
            <SearchableSelect
              id="ef-building"
              name="building"
              required
              defaultValue={String(record?.building_id ?? search.building ?? "")}
              disabled={buildings.isPending}
              invalid={Boolean(state.fields.building)}
              placeholder={t("elevator.selectBuilding")}
              options={(buildings.data?.results ?? []).map((building) => ({
                value: String(building.id),
                label: building.name,
                hint: building.customer_name,
              }))}
            />
          </Field>

          {/* Hidden, not unmounted: an uncontrolled input that leaves the tree
              takes its value with it. */}
          {TABS.map((tab) => (
            <div
              key={tab.key}
              hidden={tab.key !== activeTab}
              className="grid max-w-3xl gap-5 sm:grid-cols-2"
            >
              {tab.fields.map((field) => (
                <FormField
                  key={field.name}
                  field={field}
                  record={record}
                  error={state.fields[field.name]}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border-subtle px-6 py-4">
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link
            to={editing ? "/elevators/$id" : "/elevators"}
            params={editing ? { id: id as string } : undefined}
            className="text-body text-muted-foreground hover:underline"
            onClick={(event) => {
              // Only when something would be lost. Asking on the way out of a
              // form nobody touched trains people to click through the question.
              if (dirty && !window.confirm(t("form.unsavedChangesBody"))) {
                event.preventDefault();
              }
            }}
          >
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}

function FormField({
  field,
  record,
  error,
}: {
  field: FieldSpec;
  record: Elevator | undefined;
  error?: string;
}) {
  const { t } = useTranslation();
  const id = `ef-${field.name}`;
  const value = initialValue(record, field);

  if (field.kind === "checkbox") {
    return (
      <label className="flex items-start gap-2.5 sm:col-span-2" htmlFor={id}>
        <input
          id={id}
          name={field.name}
          type="checkbox"
          defaultChecked={value === true}
          className="mt-0.5 size-4 rounded-xs accent-primary"
        />
        <span className="flex flex-col leading-tight">
          <span className="text-body">{t(field.labelKey)}</span>
          {field.hintKey && (
            <span className="text-help text-muted-foreground">{t(field.hintKey)}</span>
          )}
        </span>
      </label>
    );
  }

  return (
    <Field
      label={t(field.labelKey)}
      htmlFor={id}
      required={field.required}
      hint={field.hintKey ? t(field.hintKey) : undefined}
      error={error}
      className={field.wide ? "sm:col-span-2" : undefined}
      bindChild={field.kind !== "select"}
    >
      {field.kind === "date" ? (
        <DatePicker
          name={field.name}
          required={field.required}
          defaultValue={String(value)}
          invalid={Boolean(error)}
        />
      ) : field.kind === "select" ? (
        <SearchableSelect
          id={id}
          name={field.name}
          required={field.required}
          defaultValue={String(value)}
          invalid={Boolean(error)}
          /* Optional selects can be left unanswered, so they carry a row that
             clears the field. A required one has none, and cannot be emptied
             once answered. */
          options={[
            ...(field.required ? [] : [{ value: "", label: "—" }]),
            ...(field.options ?? []).map((option) => ({
              value: option,
              label: enumLabel(field.enumKey ?? "", option),
            })),
          ]}
        />
      ) : (
        <Input
          name={field.name}
          type={field.kind === "number" ? "number" : "text"}
          maxLength={field.maxLength}
          defaultValue={String(value)}
          invalid={Boolean(error)}
        />
      )}
    </Field>
  );
}
