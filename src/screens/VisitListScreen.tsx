import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { visitListQuery, visitTechniciansQuery, type MaintenanceVisit } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { toDisplay } from "@/lib/date";
import { useSession } from "@/lib/session";
import { useListSearch } from "@/lib/list-search";
import { attentionCount, canReadVisits } from "@/lib/visit";
import { visitFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { VisitStatusChip } from "@/components/ui/status-chip";
import { VisitsRestricted } from "@/components/visits/VisitsRestricted";

/**
 * Every maintenance visit the signed-in person may see, newest first.
 *
 * A technician sees the visits for the customers they are assigned to — the
 * server narrows that in its queryset, so this screen has nothing to filter
 * and nothing to explain beyond what the rows already say.
 *
 * There is no create button. A visit is recorded against one lift and its
 * contract, both of which the form needs before it can draw a single row, so
 * the way in is the elevator's own page — usually reached by scanning the
 * sticker on the lift in question.
 */
export function VisitListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const list = useListSearch(filters);
  const canRead = canReadVisits(role);

  // The same default the route's prefetch applies — see `visitListParams`.
  const query = useQuery({
    ...visitListQuery({ ordering: "-visit_date", ...list.params }),
    enabled: canRead,
  });

  // The firm's technicians, for the technician menu — readable by every role
  // that may read visits, so the menu is offered to all of them.
  const technicians = useQuery({ ...visitTechniciansQuery(), enabled: canRead });
  const barFilters = filters.map((filter) =>
    filter.param === "technician"
      ? {
          ...filter,
          options: (technicians.data ?? []).map((technician) => ({
            value: technician.id,
            labelKey: "visit.fields.technician",
            // A name is data, not a translation key — see `ListFilterOption`.
            label: technician.name,
          })),
        }
      : filter,
  );

  if (!canRead) return <VisitsRestricted />;

  const rows = query.data?.results ?? [];

  const columns: ListColumn<MaintenanceVisit>[] = [
    {
      key: "visit.fields.visitDate",
      sticky: true,
      cell: (row) => (
        <Link
          to="/maintenance-visits/$id"
          params={{ id: row.id }}
          className="tnum whitespace-nowrap hover:underline"
        >
          {toDisplay(row.visit_date)}
        </Link>
      ),
    },
    {
      key: "visit.fields.elevator",
      cell: (row) => (
        <Link to="/elevators/$id" params={{ id: row.elevator }} className="hover:underline">
          <Stacked primary={row.elevator_name} />
        </Link>
      ),
    },
    {
      key: "visit.fields.technician",
      hideOnMobile: true,
      cell: (row) => row.technician_name || <span className="text-subtle">—</span>,
    },
    { key: "visit.fields.status", cell: (row) => <VisitStatusChip value={row.status} /> },
    {
      key: "visit.fields.attention",
      numeric: true,
      // Zero is the expected answer and stays quiet; anything else is the
      // reason somebody opens this list, so it carries the warning ink.
      cell: (row) => {
        const count = attentionCount(row.items);
        if (count === 0) return <span className="tnum text-subtle">0</span>;
        return (
          <span className="inline-flex items-center gap-1 tnum text-warning">
            <TriangleAlert className="size-3" aria-hidden="true" />
            {count}
          </span>
        );
      },
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.records"
      titleKey="visit.title"
      state={list}
      filters={barFilters}
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
      emptyTitleKey="visit.empty"
    />
  );
}
