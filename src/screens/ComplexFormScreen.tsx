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
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { parseCoordinates } from "@/lib/map-provider";
import { AddressSelect } from "@/components/forms/AddressSelect";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";

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
          <Link to="/complexes" className="hover:underline">
            {t("complex.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{editing ? t("common.edit") : t("complex.add")}</span>
        </nav>
        <h1 className="text-title">{editing ? record?.name : t("complex.add")}</h1>
      </div>

      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const values: Record<string, unknown> = formValues(event.currentTarget);
          // The picker renders its hidden inputs only while it holds a pin, so
          // a cleared location is an absent key — and on a PATCH an absent key
          // means "leave it alone". null is how the API is told to forget it.
          if (editing && record?.latitude != null && values.latitude === undefined) {
            values.latitude = null;
            values.longitude = null;
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
            defaultValue={record?.customer_id ?? search.customer ?? ""}
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
          // `ComplexWriteRequest` carries latitude and longitude, so a pin
          // dropped here is a pin that gets saved. That is the whole test for
          // whether a screen may show a map.
          location={{ initial: parseCoordinates(record?.latitude, record?.longitude) }}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("address.fields.street")} htmlFor="cf-street" error={state.fields.street}>
            <Input name="street" maxLength={150} defaultValue={record?.street} />
          </Field>
          <Field
            label={t("address.fields.buildingNumber")}
            htmlFor="cf-number"
            error={state.fields.building_number}
          >
            <Input name="building_number" maxLength={20} defaultValue={record?.building_number} />
          </Field>
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
