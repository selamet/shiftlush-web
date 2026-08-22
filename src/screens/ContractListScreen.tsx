import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { contractListQuery, type Contract } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { ContractStatusChip } from "@/components/ui/status-chip";

export function ContractListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useQuery(contractListQuery({ page, page_size: pageSize }));
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
      exportable
      filters={[{ labelKey: "contract.fields.status" }, { labelKey: "customer.singular" }]}
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
      emptyTitleKey="empty.noContracts"
      // A contract needs a customer to belong to, so an empty list here is more
      // often "no customers yet".
      prerequisite={{ labelKey: "customer.add", to: "/customers" }}
    />
  );
}
