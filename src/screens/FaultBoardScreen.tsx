import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import {
  customerListQuery,
  faultListQuery,
  visitTechniciansQuery,
  type Fault,
} from "@/api/queries";
import type { FaultStatus } from "@/api/enums";
import { errorMessage, supportReference } from "@/api/errors";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useListSearch } from "@/lib/list-search";
import { relativeTime } from "@/lib/notifications";
import { ACTIVE_STATUSES, boardOrder, boardParams, canUseFaults, isOffice } from "@/lib/faults";
import { faultFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { ResponseTimer } from "@/components/faults/ResponseTimer";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { FaultPriorityChip, FaultStatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

/**
 * The fault board: what is broken now, the worst first.
 *
 * With no status chosen it is the live board — every fault still somebody's
 * job, open through resolved, ordered by priority and then by how long it has
 * waited. The server filters one status at a time, so that view is one request
 * per active status, put back into a single order here; a firm's live faults
 * are a few dozen, well inside one page each. Choosing a status turns it into
 * an ordinary paged list, which is how closed and cancelled history is read.
 *
 * Read by technicians too: the server narrows them to their customers, and a
 * technician looking for the fault the office phoned about finds it here.
 */
export function FaultBoardScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const allowed = canUseFaults(role);
  const list = useListSearch(filters);

  const chosen = list.filters.status as FaultStatus | undefined;
  const { status: _status, page: _page, page_size: _size, ...narrowing } = list.params;

  const single = useQuery({
    ...faultListQuery({ ...list.params, ordering: "priority_rank,reported_at" }),
    enabled: allowed && Boolean(chosen),
  });
  const board = useQueries({
    queries: ACTIVE_STATUSES.map((status) => ({
      ...faultListQuery(boardParams(narrowing, status)),
      enabled: allowed && !chosen,
    })),
  });

  const office = isOffice(role);
  const technicians = useQuery({ ...visitTechniciansQuery(), enabled: allowed });
  // The customer menu needs names; the technician sees only their own
  // customers, which the same endpoint already narrows to.
  const customers = useQuery({ ...customerListQuery({ page_size: 100 }), enabled: allowed });

  if (!allowed) return <PlanRestricted titleKey="fault.restricted" />;

  const barFilters = filters.map((filter) => {
    if (filter.param === "technician") {
      return {
        ...filter,
        options: (technicians.data ?? []).map((one) => ({
          value: one.id,
          labelKey: "fault.fields.technician",
          label: one.name,
        })),
      };
    }
    if (filter.param === "customer") {
      return {
        ...filter,
        options: (customers.data?.results ?? []).map((one) => ({
          value: one.id,
          labelKey: "fault.fields.customer",
          label: one.legal_name,
        })),
      };
    }
    return filter;
  });

  let rows: Fault[];
  let total: number;
  let loading: boolean;
  let failure: unknown = null;
  if (chosen) {
    rows = single.data?.results ?? [];
    total = single.data?.pagination.total ?? 0;
    loading = single.isPending;
    failure = single.isError ? single.error : null;
  } else {
    // One order across the statuses, then paged here: the pager below the
    // table works on this merged list the way it works on a server page.
    const merged = board.flatMap((query) => query.data?.results ?? []).sort(boardOrder);
    total = merged.length;
    const start = (list.page - 1) * list.pageSize;
    rows = merged.slice(start, start + list.pageSize);
    loading = board.some((query) => query.isPending);
    failure = board.find((query) => query.isError)?.error ?? null;
  }

  const columns: ListColumn<Fault>[] = [
    {
      key: "fault.fields.reference",
      sticky: true,
      cell: (row) => (
        <Link
          to="/faults/$id"
          params={{ id: row.id }}
          className={cn("flex flex-col items-start gap-1 hover:underline", row.priority === "emergency" && "font-semibold")}
        >
          <span className="font-mono tnum">{row.reference}</span>
          <FaultPriorityChip value={row.priority} />
        </Link>
      ),
    },
    {
      key: "fault.fields.elevator",
      cell: (row) => (
        <Stacked
          primary={
            <span className="inline-flex items-center gap-1.5">
              {row.elevator_name}
              {row.channel === "public_qr" && (
                <QrCode
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label={t("fault.channel.public_qr")}
                />
              )}
            </span>
          }
          secondary={`${row.building_name} · ${row.customer_name}`}
        />
      ),
    },
    { key: "fault.fields.status", cell: (row) => <FaultStatusChip value={row.status} /> },
    {
      key: "fault.fields.technician",
      hideOnMobile: true,
      cell: (row) =>
        row.technician_name || (
          <span className="text-help font-medium text-muted-foreground">{t("fault.nobodySent")}</span>
        ),
    },
    {
      key: "fault.fields.reportedAt",
      hideOnMobile: true,
      cell: (row) => (
        <time dateTime={row.reported_at} title={formatDateTime(row.reported_at)} className="whitespace-nowrap">
          {relativeTime(row.reported_at, t)}
        </time>
      ),
    },
    {
      key: "fault.fields.responseTime",
      cell: (row) => <ResponseTimer fault={row} />,
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey={office ? "fault.title" : "fault.titleTechnician"}
      state={list}
      filters={barFilters}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      total={total}
      loading={loading}
      error={
        failure
          ? {
              message: errorMessage(failure, t),
              reference: supportReference(failure),
              onRetry: () => {
                void single.refetch();
                board.forEach((query) => void query.refetch());
              },
            }
          : undefined
      }
      emptyTitleKey={chosen ? "fault.empty" : "fault.emptyActive"}
    />
  );
}
