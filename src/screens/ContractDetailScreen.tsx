import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ChevronRight, FileText, Ban, RefreshCw, Lock } from "lucide-react";
import contract from "@fixtures/demo-contract.json";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContractStatusChip, ElevatorStatusChip } from "@/components/ui/status-chip";
import { InspectionLabel } from "@/components/ui/inspection-label";

function Row({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="text-help text-muted-foreground">{label}</span>
      <span className={cn("text-cell text-right", muted && "text-subtle")}>{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <h2 className="mb-2 text-cardtitle">{title}</h2>
      {children}
    </section>
  );
}

export function ContractDetailScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const [confirming, setConfirming] = useState<"terminate" | "renew" | null>(null);

  // The two role boundaries this screen exists to demonstrate. Both are UI
  // convenience only — the server enforces them independently (spec 6.3).
  const canSeeFinancials = role === "owner" || role === "admin" || role === "accountant";
  const canSeeTechnical = role !== "accountant";
  const canWrite = role === "owner" || role === "admin" || role === "operations";

  const monthlyTotal = contract.elevators.reduce(
    (sum, elevator) => sum + Number(elevator.unit_price),
    0,
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/contracts" className="hover:underline">
              {t("contract.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground font-mono">{contract.contract_number}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title font-mono tnum">{contract.contract_number}</h1>
            <ContractStatusChip value={contract.status} />
          </div>
          <p className="text-help text-muted-foreground">{contract.customer}</p>
        </div>

        {canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirming("renew")}>
              <RefreshCw />
              {t("contract.actions.renew")}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirming("terminate")}>
              <Ban />
              {t("contract.actions.terminate")}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Card title={t("contract.singular")}>
            <div className="flex flex-col">
              <Row
                label={t("contract.fields.customer")}
                value={
                  <Link
                    to="/customers/$id"
                    params={{ id: "c1" }}
                    className="text-primary hover:underline"
                  >
                    {contract.customer}
                  </Link>
                }
              />
              <Row
                label={t("contract.fields.scope")}
                value={enumLabel("contract.scope", contract.scope)}
              />
              <Row
                label={t("contract.fields.startDate")}
                value={formatDate(contract.start_date)}
              />
              <Row label={t("contract.fields.endDate")} value={formatDate(contract.end_date)} />
              <Row
                label={t("contract.fields.autoRenew")}
                value={contract.auto_renew ? t("common.yes") : t("common.no")}
              />
              <Row
                label={t("contract.fields.renewalNoticeDays")}
                value={contract.renewal_notice_days}
              />
            </div>
          </Card>

          {/* Accounting has no use for the technical record and does not get it;
              the boundary is stated rather than left as an empty panel. */}
          <Card title={t("contractDetail.coveredElevators")}>
            {canSeeTechnical ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-cell">
                  <thead>
                    <tr className="border-b border-border">
                      {[
                        "elevator.fields.registrationNumber",
                        "elevator.singular",
                        "elevator.fields.status",
                        "elevator.fields.inspectionLabel",
                      ].map((key) => (
                        <th
                          key={key}
                          scope="col"
                          className="h-8 px-2 text-left text-colhead uppercase text-muted-foreground whitespace-nowrap"
                        >
                          {t(key)}
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
                        className="h-control-md border-b border-border-subtle last:border-0"
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
                            <span>{elevator.name}</span>
                            <span className="text-help text-muted-foreground">
                              {elevator.building}
                            </span>
                          </div>
                        </td>
                        <td className="px-2">
                          <ElevatorStatusChip value={elevator.status} />
                        </td>
                        <td className="px-2">
                          <InspectionLabel value={elevator.inspection_label} />
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
            ) : (
              <p className="flex items-center gap-2 py-2 text-help text-subtle">
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                {t("detail.hiddenForRole")}
              </p>
            )}
            <p className="mt-3 text-help text-muted-foreground">
              {t("contractDetail.elevatorCount", { count: contract.elevators.length })}
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {/* Operations runs the fleet, not the money. Rather than blanking the
              card, the boundary is named so nobody reads it as missing data. */}
          <Card title={t("contractDetail.financials")}>
            {canSeeFinancials ? (
              <div className="flex flex-col">
                <Row
                  label={t("contract.fields.pricingType")}
                  value={enumLabel("contract.pricingType", contract.pricing_type)}
                />
                <Row
                  label={t("contract.fields.monthlyFee")}
                  value={formatMoney(contract.monthly_fee, contract.currency)}
                />
                <Row
                  label={t("contract.fields.vatRate")}
                  value={formatPercent(contract.vat_rate)}
                />
                <Row
                  label={t("contract.fields.billingPeriod")}
                  value={enumLabel("contract.billingPeriod", contract.billing_period)}
                />
                <Row
                  label={t("contractDetail.monthlyTotal")}
                  value={
                    <span className="font-semibold">
                      {formatMoney(monthlyTotal.toFixed(2), contract.currency)}
                    </span>
                  }
                />
              </div>
            ) : (
              <p className="flex items-center gap-2 py-2 text-help text-subtle">
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                {t("detail.hiddenForRole")}
              </p>
            )}
          </Card>

          <Card title={t("contractDetail.documents")}>
            <div className="flex items-center gap-3 py-1">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-cell">
                {contract.signed_document}
              </span>
              <Button size="iconXs" variant="ghost" aria-label={t("common.download")}>
                <FileText />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Termination touches several tables and cannot be undone, so the dialog
          names each effect instead of asking a generic "are you sure". */}
      <ConfirmDialog
        open={confirming === "terminate"}
        weight="heavy"
        title={t("contractDetail.terminateTitle")}
        body={t("contractDetail.terminateBody", { count: contract.elevators.length })}
        consequences={[
          t("contractDetail.elevatorCount", { count: contract.elevators.length }),
          t("contractDetail.terminationReasonRequired"),
        ]}
        confirmLabel={t("contractDetail.terminateConfirm")}
        onConfirm={() => setConfirming(null)}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming === "renew"}
        title={t("contractDetail.renewTitle")}
        body={t("contractDetail.renewBody")}
        confirmLabel={t("contract.actions.renew")}
        onConfirm={() => setConfirming(null)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
