import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { buildingListQuery, type Building } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { enumLabel } from "@/lib/i18n";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";

export function BuildingListScreen() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useQuery(buildingListQuery({ page, page_size: pageSize }));
  const rows = query.data?.results ?? [];

  const columns: ListColumn<Building>[] = [
    {
      key: "building.fields.name",
      sticky: true,
      cell: (row) => (
        <Link to="/buildings/$id/edit" params={{ id: row.id }} className="hover:underline">
          {/* The complex when there is one, the customer otherwise: inside a
              managed site the block name alone does not say whose it is. */}
          <Stacked primary={row.name} secondary={row.complex_name || row.customer_name} />
        </Link>
      ),
    },
    {
      key: "building.fields.type",
      hideOnMobile: true,
      cell: (row) => enumLabel("building.type", row.type),
    },
    {
      key: "address.fields.neighborhood",
      hideOnMobile: true,
      cell: (row) => <Stacked primary={row.neighborhood_name} secondary={row.district_name} />,
    },
    { key: "building.fields.floorCount", numeric: true, cell: (row) => row.floor_count ?? "—" },
    { key: "building.fields.unitCount", numeric: true, cell: (row) => row.unit_count ?? "—" },
    { key: "customer.elevatorCount", numeric: true, cell: (row) => row.elevator_count },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="building.title"
      primaryActionKey="building.add"
      primaryActionTo="/buildings/new"
      exportable
      filters={[
        { labelKey: "building.fields.type" },
        { labelKey: "customer.singular" },
        { labelKey: "complex.singular" },
      ]}
      columns={columns}
      rows={rows}
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
      emptyTitleKey="empty.noBuildings"
      // A building cannot exist without a customer, so an empty list here is
      // more often "no customers yet" than "no buildings yet".
      prerequisite={{ labelKey: "customer.add", to: "/customers" }}
    />
  );
}
