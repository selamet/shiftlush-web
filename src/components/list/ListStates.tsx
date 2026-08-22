import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A table waiting for its first page.
 *
 * Rows rather than a spinner, at the height the real rows will occupy, so the
 * page does not resize the moment data lands. A spinner in the middle of an
 * empty area tells the user something is happening; a table-shaped skeleton
 * tells them what is coming, and holds the scroll position while it does.
 */
export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden" role="status" aria-label={t("common.loading")}>
      <div className="h-8 border-b border-border bg-background" />
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex h-10 items-center gap-3 border-b border-border-subtle px-3"
        >
          {Array.from({ length: columns }, (_, columnIndex) => (
            <div
              key={columnIndex}
              className="h-3 flex-1 animate-pulse rounded-xs bg-muted"
              // Uneven widths: a grid of identical bars reads as a rendering
              // fault rather than as text that has not arrived.
              style={{ maxWidth: columnIndex === 0 ? "40%" : `${28 + ((columnIndex * 7) % 24)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * A list that could not be loaded.
 *
 * Deliberately not the empty state. Reporting a failed request as "no records"
 * is a lie that sends people looking for data they have not lost, and it is the
 * single most expensive way to render an error.
 */
export function ListError({
  message,
  reference,
  onRetry,
}: {
  message: string;
  reference?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <AlertTriangle className="size-6 text-danger" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-cardtitle">{t("list.loadFailed")}</p>
        <p className="max-w-sm text-body text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
      {/* Only present for faults the user cannot act on, and it is what the
          support line asks for first. */}
      {reference && (
        <p className="text-help text-subtle">
          {t("errors.requestIdLabel")}: <span className="font-mono">{reference}</span>
        </p>
      )}
    </div>
  );
}

/**
 * A record page waiting for its data.
 *
 * Shaped like the page it precedes — a header block and two columns of cards —
 * rather than a centred spinner, so the layout does not jump when the record
 * arrives and the user can already see where things will be.
 */
export function DetailSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 p-6" role="status" aria-label={t("common.loading")}>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-40 animate-pulse rounded-xs bg-muted" />
        <div className="h-6 w-72 animate-pulse rounded-xs bg-muted" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {[0, 1].map((column) => (
          <div key={column} className="flex flex-col gap-4">
            {[0, 1].map((card) => (
              <div
                key={card}
                className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-card p-5"
              >
                <div className="h-4 w-32 animate-pulse rounded-xs bg-muted" />
                {[0, 1, 2].map((line) => (
                  <div key={line} className="flex justify-between gap-4">
                    <div className="h-3 w-24 animate-pulse rounded-xs bg-muted" />
                    <div className="h-3 flex-1 max-w-40 animate-pulse rounded-xs bg-muted" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
