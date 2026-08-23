import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  auditLogListQuery,
  userListQuery,
  type AuditEntry,
  type ListParams,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { describeAuditEntry } from "@/lib/audit";
import { enumLabel } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useListSearch } from "@/lib/list-search";
import { auditLogFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { StatusChip } from "@/components/ui/status-chip";

/** Create is routine, update is routine, delete is the one worth spotting. */
const ACTION_WEIGHT = {
  create: "outline",
  update: "silent",
  delete: "ink",
} as const;

/**
 * The last moment of a chosen day, spelled out rather than computed.
 *
 * `until` is a calendar day the reader picked, and the server compares it
 * against a timestamp with `lte`. Sent as the bare day it means midnight, so
 * "until the 14th" silently excludes everything that happened on the 14th —
 * which on an audit trail is the day you are most likely to be asking about.
 *
 * Built by concatenation on purpose. Putting the day through a `Date` to add
 * hours to it and reading it back with `toISOString()` moves the day itself in
 * every timezone east of Greenwich, and this is a product used in one.
 */
function endOfDay(day: string): string {
  return `${day}T23:59:59`;
}

/**
 * Who did what, and when.
 *
 * Read when something has gone wrong, which is what the filters are for and
 * also why nothing here is narrowed in the browser. Every row on screen came
 * from the endpoint under the query in the address bar, so the URL is a
 * complete account of what is being shown and can be pasted into the incident
 * notes beside the conclusion drawn from it.
 */
export function AuditLogListScreen() {
  const { t } = useTranslation();
  const list = useListSearch(filters);
  const { role } = useSession();

  // Owners and admins only (spec 6.2). The request is not made for anyone else
  // rather than made and refused: a 403 on every visit puts a red line in the
  // console of every technician who lands here from a stale link, and the
  // screen would be explaining itself after the fact instead of up front.
  const canRead = role === "owner" || role === "admin";

  // Two adjustments between the URL and the request, both about the endpoint's
  // semantics rather than the reader's intent: the day-end above, and
  // newest-first, which is the only order a trail is read in.
  const params: ListParams = { ordering: "-created_at", ...list.params };
  if (typeof params.until === "string" && params.until) params.until = endOfDay(params.until);

  const query = useQuery({ ...auditLogListQuery(params), enabled: canRead });

  // The colleagues, for the actor menu and for naming the actor on its chip.
  // Behind the same gate: someone who may not read the trail has no menu to
  // fill, and asking anyway would be a second needless request.
  const team = useQuery({ ...userListQuery({ page_size: 100 }), enabled: canRead });
  const barFilters = filters.map((filter) =>
    filter.param === "user_id"
      ? {
          ...filter,
          options: (team.data?.results ?? []).map((user) => ({
            value: user.id,
            labelKey: "auditLog.fields.actor",
            // The name as the API sent it. It is data, not a translation.
            label: user.full_name,
          })),
        }
      : filter,
  );

  const rows = query.data?.results ?? [];

  const columns: ListColumn<AuditEntry>[] = [
    {
      key: "auditLog.fields.createdAt",
      sticky: true,
      cell: (row) => (
        <span className="tnum whitespace-nowrap">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: "auditLog.fields.record",
      // The table it happened to, over the id it happened to. There is no name
      // to show: the trail holds a plain `record_id` with no join, deliberately,
      // so that it outlives the hard deletion of the row it describes — and a
      // name fetched now would be the name the record carries today rather than
      // the one it carried when the change was made.
      cell: (row) => (
        <Stacked
          primary={enumLabel("auditLog.table", row.table_name)}
          secondary={<span className="font-mono">{row.record_id}</span>}
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
      // The same sentence the record's own history panel shows, from the same
      // helper. Two ways of phrasing one event is how a trail and the screen
      // above it start disagreeing about what happened.
      cell: (row) => <span className="text-cell">{describeAuditEntry(row, t)}</span>,
    },
    {
      key: "auditLog.fields.actor",
      cell: (row) => row.user_name || <span className="text-subtle">{t("audit.system")}</span>,
    },
    {
      key: "auditLog.fields.ipAddress",
      hideOnMobile: true,
      cell: (row) =>
        row.ip_address ? (
          <span className="font-mono tnum text-muted-foreground">{row.ip_address}</span>
        ) : (
          <span className="text-subtle">{t("common.none")}</span>
        ),
    },
  ];

  if (!canRead) {
    return (
      <div className="flex flex-col gap-3 px-6 py-16 text-center">
        <ShieldOff className="size-8 self-center text-subtle" aria-hidden="true" />
        <p className="text-body text-muted-foreground">{t("auditLog.restricted")}</p>
        <p className="text-help text-subtle">{t("auditLog.restrictedHint")}</p>
      </div>
    );
  }

  return (
    <>
      <ListPage
        breadcrumbKey="nav.groups.administration"
        titleKey="auditLog.title"
        state={list}
        filters={barFilters}
        columns={columns}
        rows={rows}
        // The trail returns no `id` — the key is a bigserial the contract
        // withholds, since it would leak how many writes a firm makes. What
        // identifies an entry instead is the event: this record, this change,
        // at this instant. `created_at` carries sub-second precision, so two
        // rows can only collide if one record changed the same way twice in
        // the same microsecond.
        rowKey={(row) => `${row.created_at}-${row.table_name}-${row.record_id}-${row.action}`}
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
        emptyTitleKey="empty.noAuditLogs"
      />
      {/* True, and worth saying where it is read. The server replaces the value
          of a password, a national id or a QR token with a mask before the row
          is ever written, so those changes are in the trail as the fact that
          they happened rather than as what they became. Nothing on this screen
          prints a stored value in any case — the change column names the fields
          that moved — but a reader hunting for the old national id should be
          told why it is not here rather than left to conclude the trail missed
          it. */}
      <p className="-mt-4 flex items-center gap-2 px-6 pb-8 text-help text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        {t("auditLog.maskedNotice")}
      </p>
    </>
  );
}
