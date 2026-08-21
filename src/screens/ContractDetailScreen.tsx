import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ChevronRight, FileText, Ban, RefreshCw, Lock, Pencil, Download } from "lucide-react";
import contract from "@fixtures/demo-contract.json";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ContractStatusChip, ElevatorStatusChip, StatusChip } from "@/components/ui/status-chip";

const TOTAL_ELEVATORS = 12;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="shrink-0 text-help text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-cell break-words">{value ?? "—"}</span>
    </div>
  );
}

function Card({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-cardtitle">{title}</h2>
        {meta}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * How a section the role cannot see is rendered.
 *
 * Three options were weighed. Leaving the fields blank reads as missing data —
 * in this product most fields are optional, so an empty one already means "not
 * entered", and operations staff would try to complete a contract that is
 * actually complete. A lock icon on every row is noise on a screen someone
 * looks at all day, and the financial block has five rows, the technical one
 * five more. Showing nothing at all fails to tell the user the section exists.
 *
 * So the section is removed and replaced by one neutral line. The user learns
 * the section exists and why it is not theirs, but not how many fields it has
 * or what they are called — the field names are themselves a small leak. Read
 * once, then the eye skips it.
 */
function HiddenSection({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <h2 className="mb-2 text-cardtitle text-muted-foreground">{title}</h2>
      <p className="flex items-start gap-2 text-help text-subtle">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {note}
      </p>
    </section>
  );
}

export function ContractDetailScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const [dialog, setDialog] = useState<"terminate" | "renew" | null>(null);
  const [typed, setTyped] = useState("");

  const canSeeFinancials = role === "owner" || role === "admin" || role === "accountant";
  const canSeeTechnical = role !== "accountant";
  const canWrite = role === "owner" || role === "admin" || role === "operations";
  const isAccountant = role === "accountant";

  /* ---------------------------------------------------------------- blocks */

  const infoRows = isAccountant
    ? // Accounting's job on this screen is the amount, not the scope or the
      // renewal notice — so the contract block shrinks to four fields.
      (["customer", "scope", "startDate", "endDate"] as const)
    : (["customer", "scope", "startDate", "endDate", "autoRenew", "renewalNoticeDays"] as const);

  const infoBlock = (
    <Card title={t("contractDetail.info")}>
      <div className="flex flex-col">
        {infoRows.map((key) => {
          const value =
            key === "customer" ? (
              <Link to="/customers/$id" params={{ id: "c1" }} className="text-primary hover:underline">
                {contract.customer}
              </Link>
            ) : key === "scope" ? (
              enumLabel("contract.scope", contract.scope)
            ) : key === "startDate" ? (
              formatDate(contract.start_date)
            ) : key === "endDate" ? (
              formatDate(contract.end_date)
            ) : key === "autoRenew" ? (
              contract.auto_renew ? (
                t("common.yes")
              ) : (
                t("common.no")
              )
            ) : (
              contract.renewal_notice_days
            );
          return <Row key={key} label={t(`contract.fields.${key}`)} value={value} />;
        })}
        {!isAccountant && (
          <>
            <Row label={t("contract.fields.previousContract")} value={contract.previous_contract} />
            <Row
              label={t("contract.fields.signedDocument")}
              value={
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {contract.signed_document}
                </span>
              }
            />
          </>
        )}
      </div>
    </Card>
  );

  const financialsBlock = canSeeFinancials ? (
    <Card title={t("contractDetail.financials")}>
      <div className="flex flex-col">
        <Row
          label={t("contract.fields.pricingType")}
          value={enumLabel("contract.pricingType", contract.pricing_type)}
        />
        <Row
          label={t("contract.fields.monthlyFee")}
          value={formatMoney(contract.monthly_fee, contract.currency)}
        />
        <Row label={t("contract.fields.vatRate")} value={formatPercent(contract.vat_rate)} />
        <Row
          label={t("contract.fields.billingPeriod")}
          value={enumLabel("contract.billingPeriod", contract.billing_period)}
        />
      </div>
    </Card>
  ) : null;

  /* The same component with a different column set per role, never a column
     left blank: operations has no unit-price column at all, and accounting has
     no elevator name or building. */
  const elevatorBlock = canSeeTechnical ? (
    <Card
      title={t("contractDetail.coveredElevators")}
      meta={
        <span className="text-help text-muted-foreground">
          {t("contractDetail.recordCount", { count: TOTAL_ELEVATORS })}
        </span>
      }
      action={
        canWrite && (
          <>
            <Button size="xs" variant="secondary">
              {t("contractDetail.removeElevator")}
            </Button>
            <Button size="xs" variant="secondary">
              {t("contractDetail.addElevator")}
            </Button>
          </>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-cell">
          <thead>
            <tr className="border-b border-border">
              {[
                t("elevator.fields.registrationNumber"),
                t("elevator.singular"),
                t("building.singular"),
                t("contract.fields.addedAt"),
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="h-8 px-2 text-left text-colhead uppercase text-muted-foreground whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
              {canSeeFinancials && (
                <th
                  scope="col"
                  className="h-8 px-2 text-right text-colhead uppercase text-muted-foreground whitespace-nowrap"
                >
                  {t("contract.fields.unitPrice")}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {contract.elevators.map((elevator) => (
              <tr
                key={elevator.registration_number}
                className={cn(
                  "h-control-md border-b border-border-subtle last:border-0",
                  elevator.removed_at && "text-muted-foreground",
                )}
              >
                <td className="px-2 font-mono tnum whitespace-nowrap">
                  <Link
                    to="/elevators/$id"
                    params={{ id: "e1" }}
                    className="text-primary hover:underline"
                  >
                    {elevator.registration_number}
                  </Link>
                </td>
                <td className="px-2">
                  <div className="flex flex-col leading-tight">
                    <span className="flex items-center gap-2">
                      {elevator.name}
                      {elevator.status === "suspended" && (
                        <ElevatorStatusChip value={elevator.status} />
                      )}
                    </span>
                    <span className="text-help text-muted-foreground">{elevator.spec}</span>
                  </div>
                </td>
                <td className="px-2">{elevator.building}</td>
                <td className="px-2 tnum whitespace-nowrap">
                  {elevator.removed_at ? (
                    <span className="flex flex-col leading-tight">
                      <StatusChip weight="recessed">{t("contractDetail.removed")}</StatusChip>
                      <span className="text-help">{formatDate(elevator.removed_at)}</span>
                    </span>
                  ) : (
                    formatDate(elevator.added_at)
                  )}
                </td>
                {canSeeFinancials && (
                  <td className="px-2 tnum text-right whitespace-nowrap">
                    {formatMoney(elevator.unit_price)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-help text-muted-foreground">{t("contractDetail.removedNote")}</p>
        <span className="tnum text-help text-muted-foreground">
          {canSeeFinancials
            ? `${t("contractDetail.subtotal")} ${formatMoney(contract.monthly_total)}`
            : t("contractDetail.amountHiddenForRole")}
        </span>
      </div>
    </Card>
  ) : (
    /* Accounting gets billing lines, not a technical register. */
    <Card
      title={t("contractDetail.lineItems")}
      meta={
        <>
          <span className="text-help text-muted-foreground">
            {t("contractDetail.itemCount", { count: TOTAL_ELEVATORS })}
          </span>
          <StatusChip weight="dashed">{t("contractDetail.readOnly")}</StatusChip>
        </>
      }
      action={
        <Button size="xs" variant="secondary">
          <Download />
          {t("list.export")}
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-cell">
          <thead>
            <tr className="border-b border-border">
              {[
                t("elevator.fields.registrationNumber"),
                t("contractDetail.period"),
                t("contract.fields.unitPrice"),
                t("contractDetail.vatIncluded"),
              ].map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(
                    "h-8 px-2 text-colhead uppercase text-muted-foreground whitespace-nowrap",
                    index >= 2 ? "text-right" : "text-left",
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contract.elevators.map((elevator) => (
              <tr
                key={elevator.registration_number}
                className="h-control-md border-b border-border-subtle last:border-0"
              >
                <td className="px-2 font-mono tnum whitespace-nowrap">
                  {elevator.registration_number}
                </td>
                <td className="px-2 tnum whitespace-nowrap">
                  {formatDate(elevator.added_at)} —{" "}
                  {elevator.removed_at ? (
                    <>
                      {formatDate(elevator.removed_at)}{" "}
                      <span className="text-muted-foreground">
                        ({t("contractDetail.closed")})
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t("contractDetail.ongoing")}</span>
                  )}
                </td>
                <td className="px-2 tnum text-right">{formatMoney(elevator.unit_price)}</td>
                <td className="px-2 tnum text-right">
                  {formatMoney(elevator.unit_price_with_vat)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-4 tnum text-help">
        <span className="text-muted-foreground">
          {t("contractDetail.subtotal")} {formatMoney(contract.monthly_total)}
        </span>
        <span className="font-medium">
          {t("contractDetail.vatIncludedMonthly", {
            amount: formatMoney(contract.monthly_total_with_vat),
          })}
        </span>
      </div>
    </Card>
  );

  /* ------------------------------------------------------------------ view */

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/contracts" className="hover:underline">
              {t("contract.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="font-mono text-foreground">{contract.contract_number}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title font-mono tnum">{contract.contract_number}</h1>
            <ContractStatusChip value={contract.status} />
          </div>
          <p className="text-help text-muted-foreground">{contract.customer}</p>
        </div>

        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDialog("renew")}>
              <RefreshCw />
              {t("contract.actions.renew")}
            </Button>
            <Button variant="secondary" size="sm">
              <Pencil />
              {t("common.edit")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          {/* Role changes the order, not just the visibility: accounting leads
              with the money because that is its business on this screen. */}
          {isAccountant ? (
            <>
              {financialsBlock}
              {infoBlock}
            </>
          ) : (
            <>
              {infoBlock}
              {canSeeFinancials ? (
                financialsBlock
              ) : (
                <HiddenSection
                  title={t("contractDetail.financials")}
                  note={t("contractDetail.hiddenFinancials")}
                />
              )}
            </>
          )}
          {elevatorBlock}
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border border-border-subtle bg-card p-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-cardtitle tnum">
                {t("contractDetail.elevatorCount", { count: TOTAL_ELEVATORS })}
              </span>
              {canSeeFinancials && (
                <span className="tnum text-body text-muted-foreground">
                  {t("contractDetail.monthlyAmount", {
                    amount: formatMoney(contract.monthly_total),
                  })}
                </span>
              )}
              <span className="text-help text-muted-foreground">
                {t("contractDetail.daysToEnd", { count: contract.days_to_end })}
              </span>
              {contract.auto_renew && (
                <span className="text-help text-muted-foreground">
                  {t("contractDetail.autoRenewOn")} ·{" "}
                  {t("contractDetail.reminderOn", { date: formatDate(contract.reminder_date) })}
                </span>
              )}
            </div>
            {canWrite ? (
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => setDialog("renew")}>
                {t("contractDetail.renewNow")}
              </Button>
            ) : (
              <p className="mt-3 flex items-start gap-2 text-help text-subtle">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t("contractDetail.hiddenActions")}
              </p>
            )}
          </section>

          {canWrite && (
            <section className="rounded-lg border-l-[3px] border-destructive bg-destructive-bg p-4">
              <p className="text-label text-destructive">
                {t("contractDetail.terminateIrreversible")}
              </p>
              <p className="mt-1 text-help text-destructive">
                {t("contractDetail.terminateSummary", { count: TOTAL_ELEVATORS })}
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setDialog("terminate")}
              >
                <Ban />
                {t("contract.actions.terminate")}
              </Button>
            </section>
          )}
        </div>
      </div>

      {/* Termination: the weight comes from three separate channels — the
          consequences are counted in real numbers, the reason is mandatory and
          goes to the audit log, and the button stays disabled until the user
          types the contract number, which forces them to look at the record.
          The phrase "are you sure" appears nowhere. */}
      {dialog === "terminate" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setDialog(null)}
            aria-label={t("common.close")}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={t("contractDetail.terminateTitle")}
            className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-cardtitle">{t("contractDetail.terminateTitle")}</h2>
              <span className="text-help text-destructive">
                {t("contractDetail.terminateIrreversible")}
              </span>
            </div>

            <div className="flex flex-col gap-2 rounded-md border-l-[3px] border-destructive bg-destructive-bg px-3 py-3">
              <span className="text-label text-destructive">
                {t("contractDetail.terminateHeading")}
              </span>
              <ul className="flex flex-col gap-1.5 text-help text-destructive">
                <li>{t("contractDetail.terminateEffectElevators", { count: TOTAL_ELEVATORS })}</li>
                <li>
                  {t("contractDetail.terminateEffectBuildings", { count: contract.building_count })}{" "}
                  ({contract.buildings.join(", ")})
                </li>
                <li>
                  {t("contractDetail.terminateEffectRevenue", {
                    amount: formatMoney(contract.monthly_total),
                  })}
                </li>
                <li>{t("contractDetail.terminateEffectReminder")}</li>
                <li>{t("contractDetail.terminateEffectHistory")}</li>
              </ul>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("contractDetail.terminationDate")} htmlFor="tr-date">
                <Input type="date" defaultValue="2026-08-22" />
              </Field>
              <Field
                label={t("contractDetail.terminationReason")}
                htmlFor="tr-reason"
                required
                hint={t("contractDetail.terminationReasonRequired")}
                bindChild={false}
              >
                <select
                  id="tr-reason"
                  className="h-control-md w-full rounded-md border border-input bg-card px-3 text-body focus-ring"
                >
                  <option>{t("contractDetail.terminationReasonPlaceholder")}</option>
                </select>
              </Field>
            </div>

            <Field label={t("contractDetail.typeNumberToConfirm")} htmlFor="tr-confirm">
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={contract.contract_number}
                className="font-mono tnum"
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={typed.trim() !== contract.contract_number}
                onClick={() => {
                  setDialog(null);
                  setTyped("");
                }}
              >
                {t("contract.actions.terminate")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal uses none of that: no red, no counted consequences, no
          type-to-confirm. Its result is a draft, so it is reversible. */}
      {dialog === "renew" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setDialog(null)}
            aria-label={t("common.close")}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("contractDetail.renewTitle")}
            className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-cardtitle">{t("contractDetail.renewTitle")}</h2>
              <p className="text-help text-muted-foreground">
                {t("contractDetail.renewBody", { number: contract.contract_number })}
              </p>
            </div>

            <div className="flex flex-col">
              <Row
                label={t("contractDetail.renewNewNumber")}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono tnum">{contract.next_contract_number}</span>
                    <ContractStatusChip value="draft" />
                  </span>
                }
              />
              <Row
                label={t("contractDetail.renewNewStart")}
                value={formatDate(contract.next_start_date)}
              />
              <Row
                label={t("contractDetail.renewNewEnd")}
                value={formatDate(contract.next_end_date)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-body">
                <input type="checkbox" defaultChecked className="size-4 rounded-xs accent-primary" />
                {t("contractDetail.renewCarryElevators", { count: TOTAL_ELEVATORS })}
              </label>
              <label className="flex items-center gap-2 text-body">
                <input type="checkbox" defaultChecked className="size-4 rounded-xs accent-primary" />
                {t("contractDetail.renewCopyTerms")}
              </label>
            </div>

            <p className="text-help text-muted-foreground">{t("contractDetail.renewReversible")}</p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={() => setDialog(null)}>
                {t("contractDetail.renewCreateDraft")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
