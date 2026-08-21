import { useParams, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Pencil, Plus, Phone, Mail } from "lucide-react";
import customers from "@fixtures/demo-customers.json";
import buildings from "@fixtures/demo-buildings.json";
import contracts from "@fixtures/demo-contracts.json";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { StatusChip, ContractStatusChip } from "@/components/ui/status-chip";

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-cardtitle">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="text-help text-muted-foreground">{label}</span>
      <span className="text-cell text-right">{value ?? "—"}</span>
    </div>
  );
}

export function CustomerDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();

  const customer = customers.find((row) => row.id === id) ?? customers[0];
  const ownBuildings = buildings.filter((row) => row.customer === customer.legal_name);
  const ownContracts = contracts.filter((row) => row.customer === customer.legal_name);
  const canWrite = role === "owner" || role === "admin" || role === "operations";
  const canSeeFinancials = role !== "operations" && role !== "technician";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <Link to="/customers" className="hover:underline">
              {t("customer.title")}
            </Link>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{customer.legal_name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title">{customer.legal_name}</h1>
            <StatusChip weight="outline">{enumLabel("customer.type", customer.type)}</StatusChip>
            {!customer.is_active && (
              <StatusChip weight="recessed">{t("common.no")}</StatusChip>
            )}
          </div>
        </div>
        {canWrite && (
          <Button size="sm">
            <Pencil />
            {t("common.edit")}
          </Button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Card title={t("customer.singular")}>
            <div className="flex flex-col">
              <Row label={t("customer.fields.taxOffice")} value={customer.tax_office} />
              <Row
                label={t("customer.fields.taxNumber")}
                value={
                  customer.tax_number ? (
                    <span className="font-mono tnum">{customer.tax_number}</span>
                  ) : null
                }
              />
              <Row label={t("customer.fields.phone")} value={customer.phone} />
            </div>
          </Card>

          <Card
            title={t("customerDetail.buildings")}
            action={
              canWrite && (
                <Link to="/buildings" className="text-help text-primary hover:underline">
                  {t("building.add")}
                </Link>
              )
            }
          >
            {ownBuildings.length === 0 ? (
              <p className="py-2 text-help text-subtle">{t("empty.noBuildings")}</p>
            ) : (
              <div className="flex flex-col">
                {ownBuildings.map((building) => (
                  <div
                    key={building.id}
                    className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-0"
                  >
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-cell">{building.name}</span>
                      <span className="truncate text-help text-muted-foreground">
                        {building.neighborhood} · {building.district}
                      </span>
                    </span>
                    <span className="shrink-0 tnum text-help text-muted-foreground">
                      {t("elevator.hints.stopCount", { count: building.elevator_count })
                        .replace(/\D+$/, "")
                        .trim()}
                      {" · "}
                      {t("customer.elevatorCount")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card
            title={t("customerDetail.contacts")}
            action={
              canWrite && (
                <Button size="iconXs" variant="ghost" aria-label={t("customerDetail.addContact")}>
                  <Plus />
                </Button>
              )
            }
          >
            {customer.primary_contact ? (
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-cell">
                  {customer.primary_contact}
                  <span className="rounded-sm border border-border-strong px-1.5 text-help text-muted-foreground">
                    {t("customerDetail.primaryBadge")}
                  </span>
                </span>
                {customer.contact_phone && (
                  <span className="flex items-center gap-1.5 text-help text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                    {customer.contact_phone}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-help text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                  {customer.phone}
                </span>
              </div>
            ) : (
              <p className="text-help text-subtle">{t("customerDetail.noContacts")}</p>
            )}
          </Card>

          <Card title={t("customerDetail.contracts")}>
            {ownContracts.length === 0 ? (
              <p className="text-help text-subtle">{t("empty.noContracts")}</p>
            ) : (
              <div className="flex flex-col">
                {ownContracts.map((row) => (
                  <Link
                    key={row.id}
                    to="/contracts/$id"
                    params={{ id: row.id }}
                    className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-0 hover:bg-muted"
                  >
                    <span className="flex flex-col leading-tight">
                      <span className="font-mono tnum text-cell">{row.contract_number}</span>
                      <span className="text-help text-muted-foreground">
                        {formatDate(row.end_date)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {canSeeFinancials && (
                        <span className="tnum text-help text-muted-foreground">
                          {formatMoney(row.monthly_fee)}
                        </span>
                      )}
                      <ContractStatusChip value={row.status} />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
