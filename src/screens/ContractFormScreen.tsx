import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  contractKeys,
  contractQuery,
  createContract,
  customerListQuery,
  updateContract,
  type Contract,
  type ContractWrite,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";

const SCOPES = ["maintenance_only", "maintenance_and_repair", "full_coverage"] as const;
const PRICING = ["per_elevator", "flat"] as const;
const BILLING = ["monthly", "quarterly", "semiannual", "annual"] as const;

export function ContractFormScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams({ strict: false }) as { id?: string };
  const search = useSearch({ strict: false }) as { customer?: string };
  const editing = Boolean(id);

  const existing = useQuery({ ...contractQuery(id ?? ""), enabled: editing });
  const customers = useQuery(customerListQuery({ page_size: 100 }));
  const idempotencyKey = useIdempotencyKey();

  const { submit, state } = useSubmit<ContractWrite, Contract>({
    mutationFn: (body) =>
      editing ? updateContract(id as string, body) : createContract(body, idempotencyKey),
    invalidate: [contractKeys.all],
    onSuccess: (contract) =>
      void navigate({ to: "/contracts/$id", params: { id: contract.id } }),
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
  // The server omits these entirely for roles that may not see money, so their
  // absence is the answer. A role check here would be a second rule.
  const showsMoney = !record || "monthly_fee" in record;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/contracts" className="hover:underline">
            {t("contract.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{editing ? t("common.edit") : t("contract.add")}</span>
        </nav>
        <h1 className="text-title">
          {editing ? record?.contract_number : t("contract.add")}
        </h1>
      </div>

      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          const values = formValues(event.currentTarget) as Record<string, unknown>;
          values.auto_renew = Boolean(
            (event.currentTarget.elements.namedItem("auto_renew") as HTMLInputElement)?.checked,
          );
          submit(values as unknown as ContractWrite);
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
          htmlFor="kf-customer"
          required
          error={state.fields.customer}
          bindChild={false}
        >
          <SearchableSelect
            id="kf-customer"
            name="customer"
            required
            defaultValue={String(record?.customer_id ?? search.customer ?? "")}
            disabled={customers.isPending}
            invalid={Boolean(state.fields.customer)}
            placeholder={t("building.selectCustomer")}
            options={(customers.data?.results ?? []).map((customer) => ({
              value: String(customer.id),
              label: customer.legal_name,
            }))}
          />
        </Field>

        <Field
          label={t("contract.fields.scope")}
          htmlFor="kf-scope"
          required
          error={state.fields.scope}
          bindChild={false}
        >
          <SearchableSelect
            id="kf-scope"
            name="scope"
            required
            defaultValue={record?.scope ?? "maintenance_only"}
            invalid={Boolean(state.fields.scope)}
            options={SCOPES.map((value) => ({
              value,
              label: enumLabel("contract.scope", value),
            }))}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("contract.fields.startDate")}
            htmlFor="kf-start"
            required
            error={state.fields.start_date}
          >
            <Input name="start_date" type="date" required defaultValue={record?.start_date} />
          </Field>
          <Field
            label={t("contract.fields.endDate")}
            htmlFor="kf-end"
            required
            // The server refuses an end date before the start; there is no
            // useful version of that rule to duplicate here.
            error={state.fields.end_date}
          >
            <Input name="end_date" type="date" required defaultValue={record?.end_date} />
          </Field>
        </div>

        {showsMoney && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t("contract.fields.pricingType")}
                htmlFor="kf-pricing"
                required
                error={state.fields.pricing_type}
                bindChild={false}
              >
                <SearchableSelect
                  id="kf-pricing"
                  name="pricing_type"
                  required
                  defaultValue={record?.pricing_type ?? "per_elevator"}
                  invalid={Boolean(state.fields.pricing_type)}
                  options={PRICING.map((value) => ({
                    value,
                    label: enumLabel("contract.pricingType", value),
                  }))}
                />
              </Field>

              <Field
                label={t("contract.fields.monthlyFee")}
                htmlFor="kf-fee"
                hint={t("contract.monthlyFeeHint")}
                error={state.fields.monthly_fee}
              >
                <Input
                  name="monthly_fee"
                  inputMode="decimal"
                  defaultValue={record?.monthly_fee ?? ""}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label={t("contract.fields.vatRate")}
                htmlFor="kf-vat"
                // Nullable on the server, and a contract with no rate totals
                // without VAT. Saying so beats letting somebody find out from
                // an invoice.
                hint={t("contract.vatRateHint")}
                error={state.fields.vat_rate}
              >
                <Input name="vat_rate" inputMode="decimal" defaultValue={record?.vat_rate ?? ""} />
              </Field>

              <Field
                label={t("contract.fields.billingPeriod")}
                htmlFor="kf-billing"
                error={state.fields.billing_period}
                bindChild={false}
              >
                <SearchableSelect
                  id="kf-billing"
                  name="billing_period"
                  defaultValue={record?.billing_period ?? "monthly"}
                  invalid={Boolean(state.fields.billing_period)}
                  options={BILLING.map((value) => ({
                    value,
                    label: enumLabel("contract.billingPeriod", value),
                  }))}
                />
              </Field>
            </div>
          </>
        )}

        <label className="flex items-start gap-2.5" htmlFor="kf-auto-renew">
          <input
            id="kf-auto-renew"
            name="auto_renew"
            type="checkbox"
            defaultChecked={record?.auto_renew ?? false}
            className="mt-0.5 size-4 rounded-xs accent-primary"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-body">{t("contract.fields.autoRenew")}</span>
            <span className="text-help text-muted-foreground">{t("contract.autoRenewHint")}</span>
          </span>
        </label>

        <Field label={t("customer.fields.notes")} htmlFor="kf-notes" error={state.fields.notes}>
          <Textarea name="notes" rows={3} defaultValue={record?.notes} />
        </Field>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={state.pending}>
            {state.pending ? t("common.saving") : t("common.save")}
          </Button>
          <Link
            to={editing ? "/contracts/$id" : "/contracts"}
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
