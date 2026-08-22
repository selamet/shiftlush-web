import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { complexListQuery, type Complex,
  customerListQuery,} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { prerequisiteMissing } from "@/lib/prerequisite";
import { listSearchSchema, useListSearch } from "@/lib/list-search";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";

/**
 * Paging only. `GET /complexes/` declares no `search` and no filter beyond
 * `customer`, which is a reference rather than a menu — so this list offers
 * neither, instead of offering both and narrowing nothing.
 */
export const complexListSearch = listSearchSchema();

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
  const list = useListSearch();

  const query = useQuery(complexListQuery(list.params));

  // Whether the parent record exists only matters when this list is empty, so
  // that is the only time the question is asked -- and one row answers it.
  const listIsEmpty =
    !query.isPending && !query.isError && (query.data?.results.length ?? 0) === 0;
  const parents = useQuery({ ...customerListQuery({ page_size: 1 }), enabled: listIsEmpty });
  const missingParent = prerequisiteMissing(parents, listIsEmpty);

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="complex.title"
      primaryActionKey="complex.add"
      primaryActionTo="/complexes/new"
      state={list}
      columns={columns}
      rows={query.data?.results ?? []}
      rowKey={(row) => row.id}
      total={query.data?.pagination.total ?? 0}
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
      prerequisite={{ labelKey: "customer.add", to: "/customers", missing: missingParent }}
    />
  );
}
