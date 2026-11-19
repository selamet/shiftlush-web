import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  createCustomerAddress,
  customerQuery,
  deleteCustomerAddress,
  keys,
  updateCustomerAddress,
  type Customer,
  type CustomerAddress,
  type CustomerAddressWrite,
} from "@/api/queries";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { parseCoordinates } from "@/lib/map-provider";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { AddressSelect } from "@/components/forms/AddressSelect";
import { DetailSkeleton, ListError, DetailError } from "@/components/list/ListStates";

/**
 * One of a customer's saved addresses.
 *
 * Reached from the customer, like the contact form: it is created through the
 * customer so the owner cannot be got wrong, and an existing address is found
 * in the customer record by the id in the URL.
 */
export function AddressFormScreen() {
  const { t } = useTranslation();
  const { id, addressId } = useParams({ strict: false }) as { id?: string; addressId?: string };
  const customerId = id ?? "";

  const customer = useQuery({ ...customerQuery(customerId), enabled: Boolean(customerId) });

  if (customer.isPending) return <DetailSkeleton />;
  if (customer.isError || !customer.data) {
    return (
      <DetailError error={customer.error} onRetry={() => void customer.refetch()} back={{ to: "/customers", labelKey: "customer.title" }} />
    );
  }

  const record = addressId
    ? (customer.data.addresses ?? []).find((address) => address.id === addressId)
    : undefined;

  if (addressId && !record) {
    // The id in the URL names no address of this customer. A blank form here
    // would quietly create a new one instead of editing the intended one.
    return <ListError message={t("errors.NOT_FOUND")} />;
  }

  return <AddressForm customer={customer.data} record={record} />;
}

function AddressForm({ customer, record }: { customer: Customer; record?: CustomerAddress }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const editing = Boolean(record);
  const idempotencyKey = useIdempotencyKey();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function backToCustomer() {
    void navigate({ to: "/customers/$id", params: { id: customer.id } });
  }

  const { submit, state } = useSubmit<Partial<CustomerAddressWrite>, CustomerAddress>({
    mutationFn: (body) =>
      record
        ? updateCustomerAddress(record.id, body)
        : createCustomerAddress(
            customer.id,
            body as Omit<CustomerAddressWrite, "customer">,
            idempotencyKey,
          ),
    // The addresses are read off the customer record, so that is what has to be
    // refetched (the list shows the billing one too).
    invalidate: [keys.customers.all],
    onSuccess: backToCustomer,
  });

  const remove = useSubmit<CustomerAddress, void>({
    mutationFn: (address) => deleteCustomerAddress(address.id),
    invalidate: [keys.customers.all],
    onSuccess: backToCustomer,
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values: Record<string, unknown> = formValues(form);
    // The picker renders its hidden inputs only while it holds a pin, so a
    // cleared location is an absent key. On a PATCH that means "leave it
    // alone", and the coordinates the user just removed would stay on the record.
    if (editing && record?.latitude != null && values.latitude === undefined) {
      values.latitude = null;
      values.longitude = null;
    }
    submit({
      ...(values as unknown as Partial<CustomerAddressWrite>),
      // formValues drops an empty string, which is right for a field left blank
      // and wrong for one deliberately cleared: a PATCH without the key keeps
      // the old text.
      street: (values.street as string | undefined) ?? "",
      building_number: (values.building_number as string | undefined) ?? "",
      unit_number: (values.unit_number as string | undefined) ?? "",
      address_note: (values.address_note as string | undefined) ?? "",
      // An unticked box sends nothing, which would read as "leave it alone" and
      // make un-marking the billing address impossible from this form.
      is_billing: (form.elements.namedItem("is_billing") as HTMLInputElement).checked,
    });
  }

  const title = editing ? t("addressForm.editTitle") : t("addressForm.newTitle");
  const failure = state.message || remove.state.message;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/customers" className="hover:underline">
            {t("customer.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <Link to="/customers/$id" params={{ id: customer.id }} className="hover:underline">
            {customer.legal_name}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{title}</span>
        </nav>
        <h1 className="text-title">{editing ? record?.label : title}</h1>
      </div>

      <form className="flex max-w-2xl flex-col gap-5" onSubmit={onSubmit}>
        {failure && (
          <Alert tone="error" block title={failure}>
            {state.reference && (
              <p className="text-help">
                {t("errors.requestIdLabel")}:{" "}
                <span className="font-mono">{state.reference}</span>
              </p>
            )}
          </Alert>
        )}

        <Field
          label={t("addressForm.fields.label")}
          htmlFor="af-label"
          required
          hint={t("addressForm.labelHint")}
          error={state.fields.label}
        >
          <Input
            name="label"
            required
            maxLength={60}
            defaultValue={record?.label}
            invalid={Boolean(state.fields.label)}
          />
        </Field>

        <AddressSelect
          name="neighborhood"
          required={false}
          error={state.fields.neighborhood}
          initial={
            record
              ? {
                  provinceId: record.province_id,
                  provinceName: record.province_name,
                  districtId: record.district_id,
                  districtName: record.district_name,
                  neighborhoodId: record.neighborhood_id,
                  neighborhoodName: record.neighborhood_name,
                }
              : undefined
          }
          location={{ initial: parseCoordinates(record?.latitude, record?.longitude) }}
        />

        <Field label={t("address.fields.street")} htmlFor="af-street" error={state.fields.street}>
          <Input name="street" maxLength={150} defaultValue={record?.street} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("address.fields.buildingNumber")}
            htmlFor="af-building-number"
            error={state.fields.building_number}
          >
            <Input name="building_number" maxLength={20} defaultValue={record?.building_number} />
          </Field>
          <Field
            label={t("address.fields.unitNumber")}
            htmlFor="af-unit-number"
            error={state.fields.unit_number}
          >
            <Input name="unit_number" maxLength={20} defaultValue={record?.unit_number} />
          </Field>
        </div>

        <Field
          label={t("addressForm.fields.addressNote")}
          htmlFor="af-address-note"
          error={state.fields.address_note}
        >
          <Textarea name="address_note" rows={3} defaultValue={record?.address_note} />
        </Field>

        <label className="flex items-start gap-2.5" htmlFor="af-is-billing">
          <input
            id="af-is-billing"
            name="is_billing"
            type="checkbox"
            defaultChecked={record?.is_billing ?? false}
            className="checkbox mt-0.5"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-body">{t("addressForm.fields.isBilling")}</span>
            <span className="text-help text-muted-foreground">{t("addressForm.billingHint")}</span>
          </span>
        </label>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link
            to="/customers/$id"
            params={{ id: customer.id }}
            className="text-body text-muted-foreground hover:underline"
          >
            {t("common.cancel")}
          </Link>
          {record && (
            <Button
              type="button"
              variant="ghost"
              className="ml-auto"
              onClick={() => setConfirmingDelete(true)}
            >
              {t("common.delete")}
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirmingDelete}
        title={t("common.delete")}
        body={t("addressForm.deleteConfirm")}
        confirmLabel={t("common.delete")}
        onConfirm={() => {
          if (record) remove.submit(record);
          setConfirmingDelete(false);
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
