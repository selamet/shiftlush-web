import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  complexKeys,
  complexQuery,
  createComplex,
  customerListQuery,
  updateComplex,
  type Complex,
  type ComplexWrite,
} from "@/api/queries";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import {
  addressBlockDefaults,
  currentAddressInput,
  editWriteBody,
  pickOptions,
  pickWrote,
  resolvePick,
  type FilledAddress,
  type PickWrote,
} from "@/lib/address-book";
import { AddressSelect } from "@/components/forms/AddressSelect";
import { SavedAddressPicker } from "@/components/forms/SavedAddressPicker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DetailSkeleton, DetailError } from "@/components/list/ListStates";

export function ComplexFormScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id?: string };
  const search = useSearch({ strict: false }) as { customer?: string };
  const editing = Boolean(id);

  const existing = useQuery({ ...complexQuery(id ?? ""), enabled: editing });
  const idempotencyKey = useIdempotencyKey();

  // Every customer, because this is a picker rather than a list: a firm with
  // sixty customers should see all of them without paging inside a form.
  const customers = useQuery(customerListQuery({ page_size: 100 }));
  const [customerId, setCustomerId] = useState<string | null>(null);

  // The last pick, and a counter that remounts the address block so its
  // uncontrolled fields take the picked values. Changing the customer resets
  // the picker, not what was already filled in.
  const [picked, setPicked] = useState<{ fill: FilledAddress; wrote: PickWrote; n: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const selectedCustomer = customerId ?? existing.data?.customer_id ?? search.customer ?? "";
  const customerRecord = customers.data?.results.find((c) => String(c.id) === selectedCustomer);
  const addressOptions = pickOptions(customerRecord?.addresses ?? [], null);

  const { submit, state } = useSubmit<ComplexWrite, Complex>({
    mutationFn: (body) =>
      editing ? updateComplex(id as string, body) : createComplex(body, idempotencyKey),
    invalidate: [complexKeys.all],
    // Back to the list rather than to the record just written: the contract
    // answers a create with the write shape, which carries no id, so routing
    // to the detail page would work against the mock and 404 against the
    // server.
    onSuccess: () => void navigate({ to: "/complexes" }),
  });

  if (editing && existing.isPending) return <DetailSkeleton />;
  if (editing && (existing.isError || !existing.data)) {
    return (
      <DetailError error={existing.error} onRetry={() => void existing.refetch()} back={{ to: "/complexes", labelKey: "complex.title" }} />
    );
  }

  const record = existing.data;
  const address = addressBlockDefaults(record, picked?.fill ?? null);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/complexes" className="hover:underline">
            {t("complex.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{editing ? t("common.edit") : t("complex.add")}</span>
        </nav>
        <h1 className="text-title">{editing ? record?.name : t("complex.add")}</h1>
      </div>

      <form
        ref={formRef}
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const values: Record<string, unknown> = formValues(event.currentTarget);
          if (editing && record) {
            // An absent key means "leave it alone" on a PATCH, so a field the
            // form holds empty (and the pin, whose hidden inputs exist only
            // while there is one) is sent explicitly.
            submit(editWriteBody(values, record, ["street", "building_number"]) as unknown as ComplexWrite);
            return;
          }
          submit(values as unknown as ComplexWrite);
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
          htmlFor="cf-customer"
          required
          error={state.fields.customer}
          bindChild={false}
        >
          <SearchableSelect
            id="cf-customer"
            name="customer"
            required
            defaultValue={selectedCustomer}
            onChange={setCustomerId}
            disabled={customers.isPending}
            invalid={Boolean(state.fields.customer)}
            placeholder={t("complex.selectCustomer")}
            options={(customers.data?.results ?? []).map((customer) => ({
              value: customer.id,
              label: customer.legal_name,
            }))}
          />
        </Field>

        <Field label={t("complex.fields.name")} htmlFor="cf-name" required error={state.fields.name}>
          <Input
            name="name"
            required
            maxLength={150}
            defaultValue={record?.name}
            invalid={Boolean(state.fields.name)}
          />
        </Field>

        <SavedAddressPicker
          // Reset when the customer changes, so it offers the new customer's
          // addresses with nothing chosen.
          key={selectedCustomer}
          options={addressOptions}
          onPick={(fill) => {
            // `wrote` is what this pick supplies of its own; the next pick
            // uses it to tell its pin and note from ones the user set.
            const resolved = resolvePick(fill, currentAddressInput(formRef.current), picked?.wrote ?? null);
            setPicked({ fill: resolved, wrote: pickWrote(fill), n: (picked?.n ?? 0) + 1 });
          }}
        />

        {/* Remounted on a pick: these fields are uncontrolled and read their
            defaults once. Only the address controls live inside. */}
        <div key={picked?.n ?? 0} className="flex flex-col gap-5">
          <AddressSelect
            name="neighborhood"
            error={state.fields.neighborhood}
            initial={address.initial}
            // `ComplexWriteRequest` carries latitude and longitude, so a pin
            // dropped here is a pin that gets saved. That is the whole test for
            // whether a screen may show a map.
            location={{ initial: address.pin }}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("address.fields.street")} htmlFor="cf-street" error={state.fields.street}>
              <Input name="street" maxLength={150} defaultValue={address.street} />
            </Field>
            <Field
              label={t("address.fields.buildingNumber")}
              htmlFor="cf-number"
              error={state.fields.building_number}
            >
              <Input name="building_number" maxLength={20} defaultValue={address.buildingNumber} />
            </Field>
          </div>
        </div>

        <Field label={t("complex.fields.notes")} htmlFor="cf-notes" error={state.fields.notes}>
          <Textarea name="notes" rows={3} defaultValue={record?.notes} />
        </Field>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link to="/complexes" className="text-body text-muted-foreground hover:underline">
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
