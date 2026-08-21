import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import logs from "@fixtures/demo-audit-logs.json";
import { enumLabel } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { StatusChip } from "@/components/ui/status-chip";

type Log = (typeof logs)[number];

/** Create is routine, update is routine, delete is the one worth spotting. */
const ACTION_WEIGHT = {
  create: "outline",
  update: "silent",
  delete: "ink",
} as const;

export function AuditLogListScreen() {
  const { t } = useTranslation();

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
        exportable
        filters={[
          { labelKey: "auditLog.fields.tableName" },
          { labelKey: "auditLog.fields.action" },
          { labelKey: "auditLog.fields.actor" },
        ]}
        columns={columns}
        rows={logs}
        rowKey={(row) => row.id}
        total={logs.length}
        emptyTitleKey="empty.noAuditLogs"
      />
      <p className="-mt-4 flex items-center gap-2 px-6 pb-8 text-help text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        {t("auditLog.maskedNotice")}
      </p>
    </>
  );
}
