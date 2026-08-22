import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  createCustomer,
  customerQuery,
  keys,
  updateCustomer,
  type Customer,
  type CustomerWrite,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { AddressSelect } from "@/components/forms/AddressSelect";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";

const TYPES = [
  "complex_management",
  "building_management",
  "corporate",
  "public",
  "individual",
] as const;

type CustomerTypeValue = (typeof TYPES)[number];

/**
 * Creating and editing a customer.
 *
 * The record is fetched by the outer component so the inner one can start with
 * it in hand. That is not tidiness: the chosen type drives which identifier the
 * form asks for, and a `useState` initialised while the record was still
 * loading would hold the default forever and open every edit on the wrong half
 * of the form.
 */
export function CustomerFormScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const editing = Boolean(id);

  const existing = useQuery({ ...customerQuery(id ?? ""), enabled: editing });

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

  return <CustomerForm record={editing ? existing.data : undefined} />;
}

function CustomerForm({ record }: { record?: Customer }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const editing = Boolean(record);
  const idempotencyKey = useIdempotencyKey();

  // The one piece of state on the form. Everything else is uncontrolled,
  // because the server decides and the browser only has to hand over what was
  // typed — but which fields to *show* is a decision the client has to make.
  const [type, setType] = useState<CustomerTypeValue>(
    (record?.type as CustomerTypeValue | undefined) ?? "corporate",
  );
  const individual = type === "individual";

  const { submit, state } = useSubmit<Partial<CustomerWrite>, Customer>({
    mutationFn: (body) =>
      record ? updateCustomer(record.id, body) : createCustomer(body as CustomerWrite, idempotencyKey),
    // Both lists and the record itself: after an edit the list still holds the
    // old name until something tells it otherwise.
    invalidate: [keys.customers.all],
    onSuccess: (customer) => {
      void navigate({ to: "/customers/$id", params: { id: customer.id } });
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    const body: Partial<CustomerWrite> = {
      ...(values as unknown as Partial<CustomerWrite>),
      // `formValues` drops empty strings, which is right for a field left
      // blank and wrong for one being emptied on purpose. These three are
      // being emptied on purpose, and saying nothing would leave the old value
      // in place — for the type switch that means the server refusing the
      // change over a field the form is no longer showing.
      tax_office: individual ? "" : (values.tax_office ?? ""),
      tax_number: individual ? "" : (values.tax_number ?? ""),
      national_id: individual ? (values.national_id ?? "") : "",
      neighborhood: values.neighborhood ? Number(values.neighborhood) : null,
      street: values.street ?? "",
      building_number: values.building_number ?? "",
      unit_number: values.unit_number ?? "",
      notes: values.notes ?? "",
      // An unticked checkbox sends nothing at all, which would read as "leave
      // it as it was" and make the box impossible to untick.
      is_active: (form.elements.namedItem("is_active") as HTMLInputElement).checked,
    };
    submit(body);
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/customers" className="hover:underline">
            {t("customer.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{editing ? t("common.edit") : t("customer.add")}</span>
        </nav>
        <h1 className="text-title">{editing ? record?.legal_name : t("customer.add")}</h1>
      </div>

      <form className="flex max-w-2xl flex-col gap-5" onSubmit={onSubmit}>
        {/* Only failures that belong to no field. A field error is already
            shown against its input; repeating it here says it twice. */}
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
          label={t("customer.fields.type")}
          htmlFor="cf-type"
          required
          hint={individual ? t("customer.individualHint") : t("customer.organisationHint")}
          error={state.fields.type}
        >
          <select
            id="cf-type"
            name="type"
            required
            value={type}
            onChange={(event) => setType(event.target.value as CustomerTypeValue)}
            className="h-control-md rounded-md border border-input bg-card px-3 text-body focus-ring pointer-coarse:h-control-lg"
          >
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {enumLabel("customer.type", value)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={t("customer.fields.legalName")}
          htmlFor="cf-legal-name"
          required
          error={state.fields.legal_name}
        >
          <Input
            name="legal_name"
            required
            maxLength={200}
            defaultValue={record?.legal_name}
            invalid={Boolean(state.fields.legal_name)}
          />
        </Field>

        {/* One identifier or the other, never both. An individual invoiced
            against a tax office is not a validation nicety — it is a record
            billed under an identity that is not theirs. */}
        {individual ? (
          <Field
            label={t("customer.fields.nationalId")}
            htmlFor="cf-national-id"
            required
            error={state.fields.national_id}
          >
            <Input
              name="national_id"
              inputMode="numeric"
              maxLength={11}
              required
              // Never returned by the API — it is personal data and on no
              // screen — so an edit form starts empty and asks again.
              placeholder={editing ? t("common.required") : undefined}
              invalid={Boolean(state.fields.national_id)}
            />
          </Field>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={t("customer.fields.taxOffice")}
              htmlFor="cf-tax-office"
              error={state.fields.tax_office}
            >
              <Input
                name="tax_office"
                defaultValue={record?.tax_office}
                invalid={Boolean(state.fields.tax_office)}
              />
            </Field>

            <Field
              label={t("customer.fields.taxNumber")}
              htmlFor="cf-tax-number"
              required
              // The check digit is the server's rule and cannot be reproduced
              // here without becoming a second copy of it.
              error={state.fields.tax_number}
            >
              <Input
                name="tax_number"
                inputMode="numeric"
                maxLength={11}
                required
                defaultValue={record?.tax_number}
                invalid={Boolean(state.fields.tax_number)}
              />
            </Field>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("customer.fields.phone")} htmlFor="cf-phone" error={state.fields.phone}>
            <Input
              name="phone"
              type="tel"
              defaultValue={record?.phone}
              invalid={Boolean(state.fields.phone)}
            />
          </Field>

          <Field label={t("customer.fields.email")} htmlFor="cf-email" error={state.fields.email}>
            <Input
              name="email"
              type="email"
              defaultValue={record?.email}
              invalid={Boolean(state.fields.email)}
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-5 rounded-lg border border-border-subtle p-5">
          <legend className="px-1.5 text-help text-muted-foreground">
            {t("customer.billingAddress")}
          </legend>

          {/* Optional, unlike a building's: where to send the invoice is
              frequently not known at the first call, and blocking the record
              on it would push people into typing something untrue. */}
          <AddressSelect
            name="neighborhood"
            required={false}
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

          <Field
            label={t("address.fields.street")}
            htmlFor="cf-street"
            error={state.fields.street}
          >
            <Input name="street" maxLength={150} defaultValue={record?.street} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={t("address.fields.buildingNumber")}
              htmlFor="cf-building-number"
              error={state.fields.building_number}
            >
              <Input
                name="building_number"
                maxLength={20}
                defaultValue={record?.building_number}
              />
            </Field>
            <Field
              label={t("address.fields.unitNumber")}
              htmlFor="cf-unit-number"
              error={state.fields.unit_number}
            >
              <Input name="unit_number" maxLength={20} defaultValue={record?.unit_number} />
            </Field>
          </div>
        </fieldset>

        <Field label={t("customer.fields.notes")} htmlFor="cf-notes" error={state.fields.notes}>
          <Textarea name="notes" rows={3} defaultValue={record?.notes} />
        </Field>

        <label className="flex items-start gap-2.5" htmlFor="cf-is-active">
          <input
            id="cf-is-active"
            name="is_active"
            type="checkbox"
            defaultChecked={record?.is_active ?? true}
            className="checkbox mt-0.5"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-body">{t("customer.fields.isActive")}</span>
            <span className="text-help text-muted-foreground">{t("customer.isActiveHint")}</span>
          </span>
        </label>

        <div className="flex items-center gap-2">
          {/* Disabled while in flight. The Idempotency-Key makes a duplicate
              submission harmless anyway, but a button that still looks pressable
              tells the user nothing is happening. */}
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link
            to={editing ? "/customers/$id" : "/customers"}
            params={editing ? { id: record?.id as string } : undefined}
            className="text-body text-muted-foreground hover:underline"
          >
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
