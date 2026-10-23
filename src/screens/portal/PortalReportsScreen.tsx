import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { errorMessage, supportReference } from "@/api/errors";
import { portalFileUrl, portalReportsQuery, type PortalReport } from "@/api/portal-queries";
import { monthYearLabel } from "@/lib/date";
import { openSignedUrl } from "@/lib/open-signed-url";
import { leadSentence, visitCounts } from "@/lib/reports";
import { ListError, TableSkeleton } from "@/components/list/ListStates";
import { Button } from "@/components/ui/button";

/**
 * The customer's monthly reports: the paper the manager takes to the
 * residents' meeting, one per month, newest first.
 *
 * Each says its month and the one sentence that leads it, so the list alone
 * answers "was everything done". The download button opens the PDF through a freshly
 * signed link from the portal's own files endpoint, which hands this customer
 * its own reports and nothing else.
 */
export function PortalReportsScreen() {
  const { t } = useTranslation();
  const reports = useQuery(portalReportsQuery());
  const [failure, setFailure] = useState("");

  async function open(report: PortalReport) {
    if (!report.file) return;
    setFailure("");
    try {
      const file = report.file;
      await openSignedUrl(async () => (await portalFileUrl(file)).download_url);
    } catch (error) {
      setFailure(errorMessage(error, t));
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{t("portal.reports.title")}</h1>
        <p className="text-help text-muted-foreground">{t("portal.reports.intro")}</p>
      </div>

      {failure && <p className="text-help text-destructive">{failure}</p>}

      {reports.isPending ? (
        <TableSkeleton columns={1} rows={3} />
      ) : reports.isError ? (
        <ListError
          message={errorMessage(reports.error, t)}
          reference={supportReference(reports.error)}
          onRetry={() => void reports.refetch()}
        />
      ) : reports.data.results.length === 0 ? (
        <p className="text-help text-subtle">{t("portal.reports.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {reports.data.results.map((report) => {
            const lead = leadSentence(report.summary, t);
            const visits = visitCounts(report.summary);
            return (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-card p-3"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-cell font-medium">{monthYearLabel(`${report.period}-01`) || report.period}</span>
                  {lead && <span className="text-help text-muted-foreground">{lead}</span>}
                  {visits && (
                    <span className="tnum text-help text-subtle">
                      {t("report.visits", { completed: visits.completed, planned: visits.planned })}
                    </span>
                  )}
                </span>
                <Button size="sm" variant="secondary" disabled={!report.file} onClick={() => void open(report)}>
                  <FileDown />
                  {report.file ? t("portal.reports.download") : t("portal.reports.noFile")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
