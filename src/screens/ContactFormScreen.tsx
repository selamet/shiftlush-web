import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  createCustomerContact,
  customerQuery,
  keys,
  updateCustomerContact,
  type Customer,
  type CustomerContact,
  type CustomerContactWrite,
} from "@/api/queries";
import { allOf, type ContactRole } from "@/api/enums";
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";

const ROLES = allOf<ContactRole>()([
  "manager",
  "auditor",
  "caretaker",
  "technical_lead",
  "accounting",
  "other",
]);

/**
 * The person to call about a customer.
 *
 * Reached from the customer, and it stays that way: the contact is created
 * through `/customers/{id}/contacts`, where the customer is in the path and
 * cannot be got wrong. Editing goes to the flat path, because a contact that
 * already exists is addressed by its own id.
 */
export function ContactFormScreen() {
  const { t } = useTranslation();
  const { id, contactId } = useParams({ strict: false }) as { id?: string; contactId?: string };
  const customerId = id ?? "";

  const customer = useQuery({ ...customerQuery(customerId), enabled: Boolean(customerId) });

  if (customer.isPending) return <DetailSkeleton />;
  if (customer.isError || !customer.data) {
    return (
      <ListError
        message={errorMessage(customer.error, t)}
        reference={supportReference(customer.error)}
        onRetry={() => void customer.refetch()}
      />
    );
  }

  const record = contactId
    ? (customer.data.contacts ?? []).find((contact) => contact.id === contactId)
    : undefined;

  if (contactId && !record) {
    // The id in the URL names no contact of this customer. A blank form here
    // would quietly create a second one instead of editing the intended one.
    return <ListError message={t("errors.NOT_FOUND")} />;
  }

  return <ContactForm customer={customer.data} record={record} />;
}

function ContactForm({ customer, record }: { customer: Customer; record?: CustomerContact }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const editing = Boolean(record);
  const idempotencyKey = useIdempotencyKey();

  const { submit, state } = useSubmit<Partial<CustomerContactWrite>, CustomerContact>({
    mutationFn: async (body) => {
      // Nothing on the server moves this flag. `is_primary` is a plain column
      // behind a partial unique constraint, with no serializer hook, no signal
      // and no transition endpoint — so promoting before demoting violates the
      // constraint, and an IntegrityError is not translated into a field error.
      // It would reach the user as a 500. The seat is emptied first.
      if (body.is_primary) {
        const held = (customer.contacts ?? []).find(
          (contact) => contact.is_primary && contact.id !== record?.id,
        );
        if (held) await updateCustomerContact(held.id, { is_primary: false });
      }
      return record
        ? updateCustomerContact(record.id, body)
        : createCustomerContact(
            customer.id,
            body as Omit<CustomerContactWrite, "customer">,
            idempotencyKey,
          );
    },
    // The contacts are read off the customer record, so that is what has to be
    // refetched — invalidating a contact key nothing reads would leave the
    // detail page showing the old list.
    invalidate: [keys.customers.all],
    onSuccess: () => {
      void navigate({ to: "/customers/$id", params: { id: customer.id } });
    },
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = formValues(form);
    submit({
      ...(values as unknown as Partial<CustomerContactWrite>),
      phone: values.phone ?? "",
      email: values.email ?? "",
      notes: values.notes ?? "",
      // An unticked box sends nothing, which would read as "leave it alone" and
      // make demoting the primary contact impossible from this form.
      is_primary: (form.elements.namedItem("is_primary") as HTMLInputElement).checked,
    });
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex flex-wrap items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/customers" className="hover:underline">
            {t("customer.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <Link
            to="/customers/$id"
            params={{ id: customer.id }}
            className="hover:underline"
          >
            {customer.legal_name}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{editing ? t("common.edit") : t("contact.add")}</span>
        </nav>
        <h1 className="text-title">{editing ? record?.full_name : t("contact.add")}</h1>
      </div>

      <form className="flex max-w-2xl flex-col gap-5" onSubmit={onSubmit}>
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
          label={t("contact.fields.fullName")}
          htmlFor="kf-full-name"
          required
          error={state.fields.full_name}
        >
          <Input
            name="full_name"
            required
            maxLength={120}
            defaultValue={record?.full_name}
            invalid={Boolean(state.fields.full_name)}
          />
        </Field>

        <Field label={t("contact.fields.role")} htmlFor="kf-role" error={state.fields.role}>
          <SearchableSelect
            id="kf-role"
            name="role"
            defaultValue={record?.role ?? "other"}
            invalid={Boolean(state.fields.role)}
            options={ROLES.map((value) => ({
              value,
              label: enumLabel("customer.contactRole", value),
            }))}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("contact.fields.phone")} htmlFor="kf-phone" error={state.fields.phone}>
            <Input
              name="phone"
              type="tel"
              defaultValue={record?.phone}
              invalid={Boolean(state.fields.phone)}
            />
          </Field>
          <Field label={t("contact.fields.email")} htmlFor="kf-email" error={state.fields.email}>
            <Input
              name="email"
              type="email"
              defaultValue={record?.email}
              invalid={Boolean(state.fields.email)}
            />
          </Field>
        </div>

        <Field label={t("contact.fields.notes")} htmlFor="kf-notes" error={state.fields.notes}>
          <Textarea name="notes" rows={3} defaultValue={record?.notes} />
        </Field>

        <label className="flex items-start gap-2.5" htmlFor="kf-is-primary">
          <input
            id="kf-is-primary"
            name="is_primary"
            type="checkbox"
            defaultChecked={record?.is_primary ?? false}
            className="mt-0.5 size-4 rounded-xs accent-primary"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-body">{t("contact.fields.isPrimary")}</span>
            {/* True because this form makes it true: the previous holder is
                demoted first, in the submit above. The server itself would
                refuse the second primary rather than move it. */}
            <span className="text-help text-muted-foreground">{t("contact.isPrimaryHint")}</span>
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
        </div>
      </form>
    </div>
  );
}
