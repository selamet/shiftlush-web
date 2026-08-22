import { useState } from "react";
import { useParams, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight, Pencil, Plus, Phone, Mail, Star, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  buildingListQuery,
  contractListQuery,
  customerQuery,
  deleteCustomerContact,
  keys,
  updateCustomerContact,
  type Customer,
  type CustomerContact,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { useSubmit } from "@/lib/form";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

function billingAddress(customer: {
  street: string;
  building_number: string;
  unit_number: string;
  neighborhood_name: string | null;
  district_name: string | null;
  province_name: string | null;
}): string | null {
  const line = [customer.street, customer.building_number, customer.unit_number && `/ ${customer.unit_number}`]
    .filter(Boolean)
    .join(" ");
  const area = [customer.neighborhood_name, customer.district_name, customer.province_name]
    .filter(Boolean)
    .join(" · ");
  const address = [line, area].filter(Boolean).join(", ");
  return address || null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="text-help text-muted-foreground">{label}</span>
      <span className="text-cell text-right">{value ?? "—"}</span>
    </div>
  );
}

/**
 * The contacts card's body.
 *
 * Split out because it owns what the rest of the screen does not: two writes
 * and the contact awaiting a deletion prompt.
 */
function ContactList({ customer, canWrite }: { customer: Customer; canWrite: boolean }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<CustomerContact | null>(null);

  /**
   * Promoting is two writes, and the order is not a preference.
   *
   * `is_primary` is a plain column behind a partial unique constraint
   * (one primary per customer, among undeleted rows) and nothing on the server
   * moves it: no serializer hook, no signal, no transition endpoint. Promoting
   * first would violate the constraint, and an IntegrityError is not translated
   * into a field error anywhere in the API — it would surface as a 500. So the
   * seat is emptied, then filled.
   *
   * The gap between the two writes is real: a failure in between leaves the
   * customer with no primary at all. That is the recoverable half — the screens
   * fall back to the first contact and the user can try again — where the other
   * order leaves a 500 and nothing to act on.
   */
  const promote = useSubmit<CustomerContact, CustomerContact>({
    mutationFn: async (contact) => {
      const held = customer.contacts.find(
        (other) => other.is_primary && other.id !== contact.id,
      );
      if (held) await updateCustomerContact(held.id, { is_primary: false });
      return updateCustomerContact(contact.id, { is_primary: true });
    },
    // The contacts arrive inside the customer record, and the customer list
    // shows the primary one too. Invalidating only the detail would leave the
    // list naming somebody who is no longer the contact.
    invalidate: [keys.customers.all],
  });

  const remove = useSubmit<CustomerContact, void>({
    mutationFn: (contact) => deleteCustomerContact(contact.id),
    invalidate: [keys.customers.all],
    onSuccess: () => setConfirming(null),
  });

  const failure = promote.state.message || remove.state.message;

  if (customer.contacts.length === 0) {
    return <p className="text-help text-subtle">{t("customerDetail.noContacts")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {failure && <Alert tone="error" block title={failure} />}

      {customer.contacts.map((contact) => (
        <div key={contact.id} className="flex flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2 text-cell">
            {canWrite ? (
              <Link
                to="/customers/$id/contacts/$contactId"
                params={{ id: customer.id, contactId: contact.id }}
                className="hover:underline"
                aria-label={t("customerDetail.editContact")}
              >
                {contact.full_name}
              </Link>
            ) : (
              contact.full_name
            )}
            <span className="text-help text-muted-foreground">
              {enumLabel("customer.contactRole", contact.role)}
            </span>
            {contact.is_primary && (
              <span className="rounded-sm border border-border-strong px-1.5 text-help text-muted-foreground">
                {t("customerDetail.primaryBadge")}
              </span>
            )}
            {canWrite && (
              <span className="ml-auto flex shrink-0 items-center">
                {!contact.is_primary && (
                  <Button
                    size="iconXs"
                    variant="ghost"
                    aria-label={t("customerDetail.makePrimary")}
                    disabled={promote.state.pending}
                    onClick={() => promote.submit(contact)}
                  >
                    <Star />
                  </Button>
                )}
                <Button
                  size="iconXs"
                  variant="ghost"
                  aria-label={t("customerDetail.deleteContact")}
                  onClick={() => setConfirming(contact)}
                >
                  <Trash2 />
                </Button>
              </span>
            )}
          </span>
          {contact.phone && (
            <span className="flex items-center gap-1.5 text-help text-muted-foreground">
              <Phone className="size-3.5 shrink-0" aria-hidden="true" />
              {contact.phone}
            </span>
          )}
          {/* The contact's own address, not the customer's. */}
          {contact.email && (
            <span className="flex items-center gap-1.5 text-help text-muted-foreground">
              <Mail className="size-3.5 shrink-0" aria-hidden="true" />
              {contact.email}
            </span>
          )}
        </div>
      ))}

      <ConfirmDialog
        open={confirming !== null}
        title={t("customerDetail.deleteContactTitle")}
        body={t("customerDetail.deleteContactBody", { name: confirming?.full_name ?? "" })}
        confirmLabel={t("common.delete")}
        onConfirm={() => {
          if (confirming) remove.submit(confirming);
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

export function CustomerDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { role } = useSession();

  const customerId = id ?? "";
  const query = useQuery({ ...customerQuery(customerId), enabled: Boolean(customerId) });

  // Filtered on the server rather than fetched whole and narrowed here: a firm
  // with five hundred buildings would otherwise download all of them to show
  // the four that belong to this customer.
  const buildingsQuery = useQuery({
    ...buildingListQuery({ customer: customerId, page_size: 100 }),
    enabled: Boolean(customerId),
  });
  const contractsQuery = useQuery({
    ...contractListQuery({ customer: customerId, page_size: 100 }),
    enabled: Boolean(customerId),
  });

  const canWrite = role === "owner" || role === "admin" || role === "operations";
  const canSeeFinancials = role !== "operations" && role !== "technician";

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError || !query.data) {
    return (
      <ListError
        message={errorMessage(query.error, t)}
        reference={supportReference(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const customer = query.data;
  const ownBuildings = buildingsQuery.data?.results ?? [];
  const ownContracts = contractsQuery.data?.results ?? [];

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
          <Link
            to="/customers/$id/edit"
            params={{ id: customer.id }}
            className={buttonVariants({ size: "sm" })}
          >
            <Pencil />
            {t("common.edit")}
          </Link>
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
              <Row label={t("customer.fields.email")} value={customer.email} />
              <Row
                label={t("customerDetail.billingAddress")}
                value={billingAddress(customer) ?? t("customerDetail.noAddress")}
              />
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
                        {building.neighborhood_name} · {building.district_name}
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
                <Link
                  to="/customers/$id/contacts/new"
                  params={{ id: customer.id }}
                  aria-label={t("customerDetail.addContact")}
                  className={buttonVariants({ size: "iconXs", variant: "ghost" })}
                >
                  <Plus />
                </Link>
              )
            }
          >
            <ContactList customer={customer} canWrite={canWrite} />
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
