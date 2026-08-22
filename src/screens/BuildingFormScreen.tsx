import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  buildingKeys,
  buildingQuery,
  complexListQuery,
  createBuilding,
  customerListQuery,
  updateBuilding,
  type Building,
  type BuildingWrite,
} from "@/api/queries";
import { allOf, type BuildingType } from "@/api/enums";
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { AddressSelect } from "@/components/forms/AddressSelect";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";

const TYPES = allOf<BuildingType>()([
  "residential",
  "commercial",
  "mixed_use",
  "public",
  "hospital",
  "mall",
  "hotel",
  "school",
  "industrial",
]);

export function BuildingFormScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id?: string };
  const search = useSearch({ strict: false }) as { customer?: string };
  const editing = Boolean(id);

  const existing = useQuery({ ...buildingQuery(id ?? ""), enabled: editing });
  const idempotencyKey = useIdempotencyKey();

  // Every customer, because this is a picker rather than a list: a firm with
  // sixty customers should see all of them without paging inside a form.
  const customers = useQuery(customerListQuery({ page_size: 100 }));
  const [customerId, setCustomerId] = useState(search.customer ?? "");

  // What the picker is currently set to: the local choice wins, so changing the
  // customer on an edit re-reads the complexes rather than going on offering
  // the previous customer's.
  const selectedCustomer = customerId || existing.data?.customer_id || "";

  // A building's customer must match its complex's customer — the server checks
  // it (spec 5.9), so the list is narrowed to the one already chosen rather
  // than offering every complex and letting the save fail.
  const complexes = useQuery({
    ...complexListQuery({ customer: selectedCustomer, page_size: 100 }),
    enabled: Boolean(selectedCustomer),
  });

  const { submit, state } = useSubmit<BuildingWrite, Building>({
    mutationFn: (body) =>
      editing ? updateBuilding(id as string, body) : createBuilding(body, idempotencyKey),
    invalidate: [buildingKeys.all],
    onSuccess: () => void navigate({ to: "/buildings" }),
  });

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

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/buildings" className="hover:underline">
            {t("building.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{editing ? t("common.edit") : t("building.add")}</span>
        </nav>
        <h1 className="text-title">{editing ? record?.name : t("building.add")}</h1>
      </div>

      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const values: Record<string, unknown> = formValues(event.currentTarget);
          // formValues drops an empty string, which is right for a field left
          // blank and wrong for one deliberately cleared: a PATCH without the
          // key leaves the old complex attached. null is how the API is told
          // to detach it.
          if (editing && record?.complex_id && values.complex === undefined) {
            values.complex = null;
          }
          submit(values as unknown as BuildingWrite);
        }}
      >
        {state.message && (
          <Alert tone="error" block title={state.message}>
            {state.reference && (
              <p className="text-help">
                {t("errors.requestIdLabel")}:{" "}
                <span className="font-mono">{state.reference}</span>
              </p>
            )}
          </Alert>
        )}

        <Field
          label={t("customer.singular")}
          htmlFor="bf-customer"
          required
          error={state.fields.customer}
          bindChild={false}
        >
          <SearchableSelect
            id="bf-customer"
            name="customer"
            required
            defaultValue={String(selectedCustomer ?? "")}
            disabled={customers.isPending}
            invalid={Boolean(state.fields.customer)}
            placeholder={t("building.selectCustomer")}
            onChange={setCustomerId}
            options={(customers.data?.results ?? []).map((customer) => ({
              value: String(customer.id),
              label: customer.legal_name,
            }))}
          />
        </Field>

        <Field
          label={t("building.fields.complex")}
          htmlFor="bf-complex"
          hint={t("complex.pickerHint")}
          error={state.fields.complex}
          bindChild={false}
        >
          <SearchableSelect
            id="bf-complex"
            name="complex"
            // Remounted when the customer changes, which clears a complex that
            // belonged to the previous one. Leaving it selected would send the
            // server a pair it is bound to reject.
            key={selectedCustomer}
            defaultValue={record?.complex_id ?? ""}
            disabled={!selectedCustomer || complexes.isPending}
            invalid={Boolean(state.fields.complex)}
            placeholder={t("complex.none")}
            // An explicit empty row, so a building can be taken back out of a
            // complex. Without one the field is a trap: choosable, never
            // unchoosable.
            options={[
              { value: "", label: t("complex.none") },
              ...(complexes.data?.results ?? []).map((complex) => ({
                value: complex.id,
                label: complex.name,
              })),
            ]}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("building.fields.name")}
            htmlFor="bf-name"
            required
            error={state.fields.name}
          >
            <Input
              name="name"
              required
              maxLength={120}
              defaultValue={record?.name}
              invalid={Boolean(state.fields.name)}
            />
          </Field>

          <Field
            label={t("building.fields.type")}
            htmlFor="bf-type"
            required
            error={state.fields.type}
            bindChild={false}
          >
            <SearchableSelect
              id="bf-type"
              name="type"
              required
              defaultValue={record?.type ?? "residential"}
              invalid={Boolean(state.fields.type)}
              options={TYPES.map((value) => ({
                value,
                label: enumLabel("building.type", value),
              }))}
            />
          </Field>
        </div>

        <AddressSelect
          name="neighborhood"
          error={state.fields.neighborhood}
          initial={
            record
              ? {
                  neighborhoodId: record.neighborhood_id,
                  districtName: record.district_name,
                  provinceName: record.province_name,
                }
              : undefined
          }
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("building.fields.street")} htmlFor="bf-street" error={state.fields.street}>
            <Input name="street" maxLength={150} defaultValue={record?.street} />
          </Field>
          <Field
            label={t("building.fields.buildingNumber")}
            htmlFor="bf-number"
            error={state.fields.building_number}
          >
            <Input name="building_number" maxLength={20} defaultValue={record?.building_number} />
          </Field>
        </div>

        <Field
          label={t("building.fields.addressNote")}
          htmlFor="bf-note"
          required
          // Required by the server: a lift engineer arriving at an address in a
          // district they do not know needs the sentence that gets them to the
          // right entrance.
          hint={t("building.addressNoteHint")}
          error={state.fields.address_note}
        >
          <Textarea name="address_note" rows={2} required defaultValue={record?.address_note} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("building.fields.floorCount")}
            htmlFor="bf-floors"
            error={state.fields.floor_count}
          >
            <Input
              name="floor_count"
              type="number"
              min={1}
              defaultValue={record?.floor_count ?? ""}
            />
          </Field>
          <Field
            label={t("building.fields.unitCount")}
            htmlFor="bf-units"
            error={state.fields.unit_count}
          >
            <Input name="unit_count" type="number" min={1} defaultValue={record?.unit_count ?? ""} />
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link to="/buildings" className="text-body text-muted-foreground hover:underline">
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
