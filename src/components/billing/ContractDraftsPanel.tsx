import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";
import { invoiceDraftListQuery } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { toDisplay } from "@/lib/date";
import { formatMoney } from "@/lib/format";
import { InvoiceStatusChip, StatusChip } from "@/components/ui/status-chip";

/** How many periods the panel shows before "all of them". */
const PANEL_SIZE = 6;

/**
 * "Invoice drafts" on a contract: what this contract has been invoiced, and
 * what is waiting. Newest period first, a draft still needing a price marked
 * in words, and the whole list one link away on the billing screen, already
 * narrowed to this contract. Rendered only for the roles that see money.
 */
export function ContractDraftsPanel({ contractId }: { contractId: string }) {
  const { t } = useTranslation();
  const query = useQuery(invoiceDraftListQuery({ contract: contractId, page_size: PANEL_SIZE }));

  if (query.isPending) return <p className="text-help text-subtle">{t("common.loading")}</p>;
  if (query.isError) return <p className="text-help text-destructive">{errorMessage(query.error, t)}</p>;

  const rows = query.data.results;
  if (rows.length === 0) return <p className="text-help text-subtle">{t("billing.noDraftsForContract")}</p>;

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id} className="border-b border-border-subtle last:border-0">
            <Link
              to="/billing/$id"
              params={{ id: row.id }}
              className="flex items-center justify-between gap-3 py-2 hover:bg-muted focus-ring"
            >
              <span className="flex flex-col leading-tight">
                <span className="tnum text-cell">
                  {toDisplay(row.period_start)} – {toDisplay(row.period_end)}
                </span>
                <span className="flex flex-wrap items-center gap-1 text-help text-muted-foreground">
                  <InvoiceStatusChip value={row.status} />
                  {row.needs_price && (
                    <StatusChip weight="ink" icon={CircleDollarSign}>
                      {t("billing.needsPrice")}
                    </StatusChip>
                  )}
                </span>
              </span>
              <span className="tnum shrink-0 text-cell">{formatMoney(row.total, row.currency)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {query.data.pagination.total > rows.length && (
        <Link
          to="/billing"
          search={{ contract: contractId }}
          className="mt-2 self-start text-help text-primary hover:underline"
        >
          {t("billing.viewAll", { count: query.data.pagination.total })}
        </Link>
      )}
    </div>
  );
}
