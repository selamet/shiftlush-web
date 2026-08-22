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
import { DetailSkeleton, ListError } from "@/components/list/ListStates";

const TYPES = [
  "complex_management",
  "building_management",
  "corporate",
  "public",
  "individual",
] as const;

/**
 * Creating and editing a customer.
 *
 * One screen for both, because the fields are the same and two screens would be
 * two places for them to drift. What differs is what happens on save and which
 * values the inputs start with — and the inputs are uncontrolled, so "start
 * with" is literally `defaultValue`.
 *
 * There is no client-side validation beyond `required`. The server decides, and
 * what it says comes back next to the field that caused it.
 */
export function CustomerFormScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id?: string };
  const editing = Boolean(id);

  const existing = useQuery({ ...customerQuery(id ?? ""), enabled: editing });
  const idempotencyKey = useIdempotencyKey();

  const { submit, state } = useSubmit<CustomerWrite, Customer>({
    mutationFn: (body) =>
      editing ? updateCustomer(id as string, body) : createCustomer(body, idempotencyKey),
    // Both lists and the record itself: after an edit the list still holds the
    // old name until something tells it otherwise.
    invalidate: [keys.customers.all],
    onSuccess: (customer) => {
      void navigate({ to: "/customers/$id", params: { id: customer.id } });
    },
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
          <Link to="/customers" className="hover:underline">
            {t("customer.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">
            {editing ? t("common.edit") : t("customer.add")}
          </span>
        </nav>
        <h1 className="text-title">{editing ? record?.legal_name : t("customer.add")}</h1>
      </div>

      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit(formValues(event.currentTarget) as unknown as CustomerWrite);
        }}
      >
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
          error={state.fields.type}
        >
          <select
            id="cf-type"
            name="type"
            required
            defaultValue={record?.type ?? "corporate"}
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
            // The check digit is the server's rule and cannot be reproduced
            // here without becoming a second copy of it.
            error={state.fields.tax_number}
          >
            <Input
              name="tax_number"
              inputMode="numeric"
              maxLength={11}
              defaultValue={record?.tax_number}
              invalid={Boolean(state.fields.tax_number)}
            />
          </Field>

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

        <Field label={t("customer.fields.notes")} htmlFor="cf-notes" error={state.fields.notes}>
          <Textarea name="notes" rows={3} defaultValue={record?.notes} />
        </Field>

        <div className="flex items-center gap-2">
          {/* Disabled while in flight. The Idempotency-Key makes a duplicate
              submission harmless anyway, but a button that still looks pressable
              tells the user nothing is happening. */}
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link
            to={editing ? "/customers/$id" : "/customers"}
            params={editing ? { id: id as string } : undefined}
            className="text-body text-muted-foreground hover:underline"
          >
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
