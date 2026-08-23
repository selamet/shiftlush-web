import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { customerListQuery, primaryContact, type Customer } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useListSearch } from "@/lib/list-search";
import { customerFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { StatusChip } from "@/components/ui/status-chip";

export function CustomerListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const list = useListSearch(filters);

  // The technician narrowing happens on the server — their token decides which
  // customers exist for them at all. The old `customers.slice(0, 2)` was a
  // stand-in that would have held only until someone opened the network tab.
  const query = useQuery(customerListQuery(list.params));
  const rows = query.data?.results ?? [];

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
      cell: (row) => <Stacked primary={row.tax_number || "—"} secondary={row.tax_office} mono />,
    },
    {
      key: "customer.primaryContact",
      hideOnMobile: true,
      cell: (row) => {
        // Picked in one place, so the list and the detail page cannot disagree
        // about who the primary contact is.
        const contact = primaryContact(row);
        return contact ? (
          <Stacked primary={contact.full_name} secondary={contact.phone} />
        ) : (
          <span className="text-subtle">—</span>
        );
      },
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
      primaryActionTo={role === "technician" ? undefined : "/customers/new"}
      state={list}
      searchable
      filters={filters}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      total={query.data?.pagination.total ?? 0}
      // Only the first load blanks the table; paging keeps the previous page on
      // screen, which is what placeholderData on the query is for.
      loading={query.isPending}
      error={
        query.isError
          ? {
              message: errorMessage(query.error, t),
              reference: supportReference(query.error),
              onRetry: () => void query.refetch(),
            }
          : undefined
      }
      emptyTitleKey={role === "technician" ? "empty.noAssignedCustomers" : "empty.noCustomers"}
    />
  );
}
