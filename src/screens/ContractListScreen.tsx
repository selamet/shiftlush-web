import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { contractListQuery, type Contract,
  customerListQuery,} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { prerequisiteMissing } from "@/lib/prerequisite";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import { enumFilter, listSearchSchema, useListSearch } from "@/lib/list-search";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { ContractStatusChip } from "@/components/ui/status-chip";

const filters = [
  enumFilter({
    param: "status",
    labelKey: "contract.fields.status",
    namespace: "contract.status",
    values: ["draft", "active", "expired", "terminated", "renewed"],
  }),
  enumFilter({
    param: "scope",
    labelKey: "contract.fields.scope",
    namespace: "contract.scope",
    values: ["maintenance_only", "maintenance_and_repair", "full_coverage"],
  }),
];

export const contractListSearch = listSearchSchema(filters);

export function ContractListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const list = useListSearch(filters);

  const query = useQuery(contractListQuery(list.params));

  // Whether the parent record exists only matters when this list is empty, so
  // that is the only time the question is asked -- and one row answers it.
  const listIsEmpty =
    !query.isPending && !query.isError && (query.data?.results.length ?? 0) === 0;
  const parents = useQuery({ ...customerListQuery({ page_size: 1 }), enabled: listIsEmpty });
  const missingParent = prerequisiteMissing(parents, listIsEmpty);
  const rows = query.data?.results ?? [];

  // The server drops the money fields for roles that may not see them, so the
  // first row answers the question. Repeating the role check here would be a
  // second rule to keep in step with the one that actually decides — and the
  // one that decides is the server's, because it controls the bytes.
  const showsMoney = rows.length === 0 || "monthly_fee" in rows[0];

  const columns: ListColumn<Contract>[] = [
    {
      key: "contract.fields.contractNumber",
      sticky: true,
      cell: (row) => (
        <Link to="/contracts/$id" params={{ id: row.id }} className="hover:underline">
          <Stacked primary={row.contract_number} secondary={row.customer_name} mono />
        </Link>
      ),
    },
    {
      key: "contract.fields.scope",
      hideOnMobile: true,
      cell: (row) => enumLabel("contract.scope", row.scope),
    },
    { key: "contract.fields.status", cell: (row) => <ContractStatusChip value={row.status} /> },
    {
      key: "contract.fields.endDate",
      cell: (row) => <span className="tnum">{formatDate(row.end_date)}</span>,
    },
    { key: "customer.elevatorCount", numeric: true, cell: (row) => row.elevator_count },
    ...(showsMoney
      ? [
          {
            key: "contract.fields.monthlyFee",
            numeric: true,
            hideOnMobile: true,
            cell: (row: Contract) => formatMoney(row.monthly_fee),
          },
        ]
      : []),
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.commercial"
      titleKey="contract.title"
      primaryActionKey={role === "accountant" ? undefined : "contract.add"}
      primaryActionTo={role === "accountant" ? undefined : "/contracts/new"}
      state={list}
      searchable
      filters={filters}
      columns={columns}
      rows={rows}
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
      emptyTitleKey="empty.noContracts"
      // A contract needs a customer to belong to, so an empty list here is more
      // often "no customers yet".
      prerequisite={{ labelKey: "customer.add", to: "/customers", missing: missingParent }}
    />
  );
}
