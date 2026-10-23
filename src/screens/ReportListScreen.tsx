import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { customerListQuery, customerReportListQuery, type CustomerReport } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { monthYearLabel } from "@/lib/date";
import { useSession } from "@/lib/session";
import { useListSearch } from "@/lib/list-search";
import { canReadReports, canSendReports, leadSentence, reportPeriodOptions, visitCounts } from "@/lib/reports";
import { reportFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { ReportDeliveryChip } from "@/components/ui/status-chip";
import {
  DownloadReportButton,
  reportMonth,
  SendReportButton,
  useOpenReport,
} from "@/components/reports/ReportControls";

/**
 * The reports screen: every customer's monthly report, for a chosen month.
 *
 * The office's question on the 1st is "did everybody get theirs", so the
 * delivery filter is the one that matters: "no recipient" and "failed" are
 * the reports somebody has to act on — tick a contact, then send — and the
 * rest is the record. The accountant reads; the office sends.
 */
export function ReportListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const allowed = canReadReports(role);
  const canSend = canSendReports(role);
  const list = useListSearch(filters);
  const opener = useOpenReport();

  const query = useQuery({ ...customerReportListQuery(list.params), enabled: allowed });
  const customers = useQuery({ ...customerListQuery({ page_size: 100 }), enabled: allowed });

  if (!allowed) return <PlanRestricted titleKey="report.restricted" />;

  const barFilters = filters.map((filter) => {
    if (filter.param === "period") {
      return {
        ...filter,
        options: reportPeriodOptions().map((value) => ({
          value,
          labelKey: "report.fields.period",
          label: monthYearLabel(`${value}-01`),
        })),
      };
    }
    if (filter.param === "customer") {
      return {
        ...filter,
        options: (customers.data?.results ?? []).map((one) => ({
          value: one.id,
          labelKey: "report.fields.customer",
          label: one.legal_name,
        })),
      };
    }
    return filter;
  });

  const columns: ListColumn<CustomerReport>[] = [
    {
      key: "report.fields.customer",
      sticky: true,
      cell: (row) => (
        <Link to="/customers/$id" params={{ id: row.customer }} className="hover:underline">
          <Stacked primary={row.customer_name} secondary={reportMonth(row.period)} />
        </Link>
      ),
    },
    {
      key: "report.fields.lead",
      hideOnMobile: true,
      cell: (row) => {
        const visits = visitCounts(row.summary);
        return (
          <Stacked
            primary={leadSentence(row.summary, t) || "—"}
            secondary={
              visits ? t("report.visits", { completed: visits.completed, planned: visits.planned }) : undefined
            }
          />
        );
      },
    },
    {
      key: "report.fields.delivery",
      cell: (row) => (
        <span className="flex flex-col gap-0.5">
          <ReportDeliveryChip value={row.delivery} />
          {row.delivery === "failed" && row.error && (
            <span className="text-help text-destructive">{t("report.failedReason", { error: row.error })}</span>
          )}
        </span>
      ),
    },
    {
      key: "common.actions",
      cell: (row) => (
        <span className="flex flex-wrap items-center justify-end gap-2">
          <DownloadReportButton report={row} onOpen={opener.open} />
          {canSend && <SendReportButton report={row} />}
        </span>
      ),
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.commercial"
      titleKey="report.title"
      state={list}
      filters={barFilters}
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
      emptyTitleKey="report.empty"
      headerExtra={
        <div className="flex flex-col gap-1">
          <p className="text-help text-muted-foreground">{t("report.intro")}</p>
          {opener.failure && <p className="text-help text-destructive">{opener.failure}</p>}
        </div>
      }
    />
  );
}
