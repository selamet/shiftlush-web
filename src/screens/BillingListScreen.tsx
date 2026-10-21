import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";
import { customerListQuery, fetchInvoiceCsv, invoiceDraftListQuery, type InvoiceDraft } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { addMonths, monthYearLabel, toDisplay, todayIso } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useListSearch } from "@/lib/list-search";
import { canUseBilling, needsPriceFirst, totalsByStatus } from "@/lib/billing";
import { billingFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { FileOffer } from "@/components/billing/FileOffer";
import { PlanRestricted } from "@/components/plan/PlanRestricted";
import { InvoiceStatusChip, StatusChip } from "@/components/ui/status-chip";

/** The months the period menu offers: this one, the eleven before it, and the next. */
function periodOptions(): string[] {
  const first = `${todayIso().slice(0, 7)}-01`;
  return Array.from({ length: 13 }, (_, index) => addMonths(first, 1 - index).slice(0, 7));
}

/**
 * The firm's invoice drafts, for the people who invoice.
 *
 * The drafts that still need a price lead every page — they are the
 * accountant's work, and nothing else can be issued while they wait. Above the
 * table, the totals per status, summed exactly from the rows on this page and
 * labelled as such: the API offers no aggregate, and a figure that looks like
 * the whole month while covering twenty-five rows would be the wrong number
 * in exactly the place people copy numbers from. The CSV is the whole filter.
 */
export function BillingListScreen() {
  const { t } = useTranslation();
  const { role } = useSession();
  const allowed = canUseBilling(role);
  const list = useListSearch(filters);

  const query = useQuery({ ...invoiceDraftListQuery(list.params), enabled: allowed });
  const customers = useQuery({ ...customerListQuery({ page_size: 100 }), enabled: allowed });

  if (!allowed) return <PlanRestricted titleKey="billing.restricted" />;

  const barFilters = filters.map((filter) => {
    if (filter.param === "period") {
      return {
        ...filter,
        options: periodOptions().map((value) => ({
          value,
          labelKey: "billing.fields.period",
          label: monthYearLabel(`${value}-01`),
        })),
      };
    }
    if (filter.param === "customer") {
      return {
        ...filter,
        options: (customers.data?.results ?? []).map((one) => ({
          value: one.id,
          labelKey: "billing.fields.customer",
          label: one.legal_name,
        })),
      };
    }
    return filter;
  });

  const rows = needsPriceFirst(query.data?.results ?? []);
  const totals = totalsByStatus(rows);
  // The export is the filter, not the page: paging is for the screen.
  const { page: _page, page_size: _size, ...exportParams } = list.params;

  const columns: ListColumn<InvoiceDraft>[] = [
    {
      key: "billing.fields.customer",
      sticky: true,
      cell: (row) => (
        <Link to="/billing/$id" params={{ id: row.id }} className="hover:underline">
          <Stacked primary={row.customer_name} secondary={<span className="font-mono">{row.contract_number}</span>} />
        </Link>
      ),
    },
    {
      key: "billing.fields.period",
      cell: (row) => (
        <span className="tnum whitespace-nowrap">
          {toDisplay(row.period_start)} – {toDisplay(row.period_end)}
        </span>
      ),
    },
    {
      key: "billing.fields.status",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1">
          <InvoiceStatusChip value={row.status} />
          {row.needs_price && (
            <StatusChip weight="outline" icon={CircleDollarSign}>
              {t("billing.needsPrice")}
            </StatusChip>
          )}
        </span>
      ),
    },
    {
      key: "billing.fields.invoiceNumber",
      hideOnMobile: true,
      cell: (row) => (row.invoice_number ? <span className="font-mono">{row.invoice_number}</span> : <span className="text-subtle">—</span>),
    },
    {
      key: "billing.fields.total",
      numeric: true,
      cell: (row) => <span className="tnum whitespace-nowrap">{formatMoney(row.total, row.currency)}</span>,
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.commercial"
      titleKey="billing.title"
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
      emptyTitleKey="billing.empty"
      headerExtra={
        <div className="flex flex-col gap-3">
          {totals.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-help text-muted-foreground">{t("billing.pageTotals")}</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {totals.map((entry) => (
                  <div key={entry.status} className="flex flex-col gap-0.5 rounded-lg border border-border-subtle bg-card p-3">
                    <span className="text-help text-muted-foreground">
                      {enumLabel("billing.status", entry.status)} · {t("billing.count", { count: entry.count })}
                    </span>
                    <span className="tnum text-cardtitle">{formatMoney(entry.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <FileOffer
            label={t("billing.exportCsv")}
            filename="fatura-taslaklari.csv"
            fetchFile={() => fetchInvoiceCsv(exportParams)}
          />
        </div>
      }
    />
  );
}
