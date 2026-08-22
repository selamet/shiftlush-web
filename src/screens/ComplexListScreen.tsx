import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { complexListQuery, type Complex } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";

/** Skips the half that is missing rather than rendering a dangling separator. */
function place(row: Complex): string {
  return [row.neighborhood_name, row.district_name].filter(Boolean).join(" · ");
}

const columns: ListColumn<Complex>[] = [
  {
    key: "complex.fields.name",
    sticky: true,
    cell: (row) => (
      <Link to="/complexes/$id" params={{ id: row.id }} className="hover:underline">
        <Stacked primary={row.name} secondary={place(row)} />
      </Link>
    ),
  },
  {
    key: "complex.fields.customer",
    hideOnMobile: true,
    cell: (row) => row.customer_name,
  },
  { key: "customer.buildingCount", numeric: true, cell: (row) => row.building_count },
  { key: "customer.elevatorCount", numeric: true, cell: (row) => row.elevator_count },
];

export function ComplexListScreen() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useQuery(complexListQuery({ page, page_size: pageSize }));

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="complex.title"
      primaryActionKey="complex.add"
      primaryActionTo="/complexes/new"
      columns={columns}
      rows={query.data?.results ?? []}
      rowKey={(row) => row.id}
      total={query.data?.pagination.total ?? 0}
      page={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(1);
      }}
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
      emptyTitleKey="empty.noComplexes"
      // A complex belongs to a customer, so there is nothing to create until
      // one exists — the empty state points there instead of offering "add".
      prerequisite={{ labelKey: "customer.add", to: "/customers" }}
    />
  );
}
