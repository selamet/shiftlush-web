import { Link } from "@tanstack/react-router";
import rows from "@fixtures/demo-contracts.json";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { ContractStatusChip } from "@/components/ui/status-chip";

type ContractRow = (typeof rows)[number];

export function ContractListScreen() {
  const { role } = useSession();
  const canSeeFinancials = role !== "operations" && role !== "technician";

  const columns: ListColumn<ContractRow>[] = [
    {
      key: "contract.fields.contractNumber",
      sticky: true,
      cell: (row) => (
        <Link to="/contracts/$id" params={{ id: row.id }} className="hover:underline">
          <Stacked primary={row.contract_number} secondary={row.customer} mono />
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
    // Money simply is not a column for operations — the boundary is applied
    // here as well as on the detail screen.
    ...(canSeeFinancials
      ? [
          {
            key: "contract.fields.monthlyFee",
            numeric: true,
            hideOnMobile: true,
            cell: (row: ContractRow) => formatMoney(row.monthly_fee),
          },
        ]
      : []),
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.commercial"
      titleKey="contract.title"
      primaryActionKey={role === "accountant" ? undefined : "contract.add"}
      exportable
      filters={[{ labelKey: "contract.fields.status" }, { labelKey: "customer.singular" }]}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      total={61}
      emptyTitleKey="empty.noContracts"
      prerequisite={{ labelKey: "customer.add", to: "/customers" }}
    />
  );
}
