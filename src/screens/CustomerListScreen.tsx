import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import customers from "@fixtures/demo-customers.json";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { StatusChip } from "@/components/ui/status-chip";

type Customer = (typeof customers)[number];

export function CustomerListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  // The technician only ever sees customers assigned to them, so an empty list
  // here is a stated condition rather than a missing record.
  const scoped = role === "technician" ? customers.slice(0, 2) : customers;

  const columns: ListColumn<Customer>[] = [
    {
      key: "customer.fields.legalName",
      sticky: true,
      cell: (row) => (
        <Link to="/customers/$id" params={{ id: row.id }} className="hover:underline">
          <Stacked primary={row.legal_name} secondary={enumLabel("customer.type", row.type)} />
        </Link>
      ),
    },
    {
      key: "customer.fields.taxNumber",
      hideOnMobile: true,
      cell: (row) => (
        <Stacked primary={row.tax_number ?? "—"} secondary={row.tax_office} mono />
      ),
    },
    {
      key: "customer.primaryContact",
      hideOnMobile: true,
      cell: (row) =>
        row.primary_contact ? (
          <Stacked primary={row.primary_contact} secondary={row.contact_phone ?? ""} />
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    { key: "customer.buildingCount", numeric: true, cell: (row) => row.building_count },
    { key: "customer.elevatorCount", numeric: true, cell: (row) => row.elevator_count },
    {
      key: "customer.fields.isActive",
      cell: (row) =>
        row.is_active ? (
          <StatusChip weight="silent">{t("common.yes")}</StatusChip>
        ) : (
          <StatusChip weight="recessed">{t("common.no")}</StatusChip>
        ),
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey={role === "technician" ? "nav.myCustomers" : "customer.title"}
      primaryActionKey={role === "technician" ? undefined : "customer.add"}
      exportable
      filters={[{ labelKey: "customer.fields.type" }, { labelKey: "customer.fields.isActive" }]}
      columns={columns}
      rows={scoped}
      rowKey={(row) => row.id}
      total={role === "technician" ? scoped.length : 52}
      emptyTitleKey={role === "technician" ? "empty.noAssignedCustomers" : "empty.noCustomers"}
    />
  );
}
