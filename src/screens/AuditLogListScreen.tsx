import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import logs from "@fixtures/demo-audit-logs.json";
import { enumLabel } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { enumFilter, listSearchSchema, useListSearch } from "@/lib/list-search";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { StatusChip } from "@/components/ui/status-chip";

type Log = (typeof logs)[number];

/** Create is routine, update is routine, delete is the one worth spotting. */
const ACTION_WEIGHT = {
  create: "outline",
  update: "silent",
  delete: "ink",
} as const;

/**
 * Named after the parameters `GET /audit-logs/` declares, so the day this
 * screen stops reading a fixture the same URL becomes the same request.
 *
 * The actor filter is not offered: it takes a `user_id`, which is a picker
 * rather than a menu. The date range is not offered here either.
 */
const filters = [
  enumFilter({
    param: "table_name",
    labelKey: "auditLog.fields.tableName",
    namespace: "auditLog.table",
    values: [
      "elevator",
      "building",
      "complex",
      "customer",
      "customer_contact",
      "contract",
      "contract_elevator",
      "user",
      "company",
      "attachment",
    ],
  }),
  enumFilter({
    param: "action",
    labelKey: "auditLog.fields.action",
    namespace: "auditLog.action",
    values: ["create", "update", "delete"],
  }),
];

export const auditLogListSearch = listSearchSchema(filters);

export function AuditLogListScreen() {
  const { t } = useTranslation();
  const list = useListSearch(filters);

  // The only list still reading a fixture, so the narrowing happens here rather
  // than in a request. Both use the parameter names above, so moving the screen
  // onto the endpoint is a change of source and not of behaviour.
  const matching = logs.filter(
    (row) =>
      (!list.filters.table_name || row.table_name === list.filters.table_name) &&
      (!list.filters.action || row.action === list.filters.action),
  );
  const rows = matching.slice((list.page - 1) * list.pageSize, list.page * list.pageSize);

  const columns: ListColumn<Log>[] = [
    {
      key: "auditLog.fields.createdAt",
      sticky: true,
      cell: (row) => (
        <span className="tnum whitespace-nowrap">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: "auditLog.fields.record",
      cell: (row) => (
        <Stacked
          primary={row.record_label}
          secondary={enumLabel("auditLog.table", row.table_name)}
        />
      ),
    },
    {
      key: "auditLog.fields.action",
      cell: (row) => (
        <StatusChip weight={ACTION_WEIGHT[row.action as keyof typeof ACTION_WEIGHT] ?? "outline"}>
          {enumLabel("auditLog.action", row.action)}
        </StatusChip>
      ),
    },
    {
      key: "auditLog.fields.change",
      hideOnMobile: true,
      cell: (row) => <span className="text-muted-foreground">{row.field_summary}</span>,
    },
    { key: "auditLog.fields.actor", hideOnMobile: true, cell: (row) => row.actor },
    {
      key: "auditLog.fields.ipAddress",
      hideOnMobile: true,
      cell: (row) => <span className="font-mono tnum text-muted-foreground">{row.ip_address}</span>,
    },
  ];

  return (
    <>
      <ListPage
        breadcrumbKey="nav.groups.administration"
        titleKey="auditLog.title"
        state={list}
        filters={filters}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        total={matching.length}
        emptyTitleKey="empty.noAuditLogs"
      />
      <p className="-mt-4 flex items-center gap-2 px-6 pb-8 text-help text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        {t("auditLog.maskedNotice")}
      </p>
    </>
  );
}
