import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { customerReportListQuery, previewCustomerReport, type CustomerReport } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { formatDateTime } from "@/lib/format";
import {
  canSendReports,
  currentReportPeriod,
  customerReportPanelParams,
  leadSentence,
  recipientList,
} from "@/lib/reports";
import { useSession } from "@/lib/session";
import { FileOffer } from "@/components/billing/FileOffer";
import { ReportDeliveryChip } from "@/components/ui/status-chip";
import { DownloadReportButton, reportMonth, SendReportButton, useOpenReport } from "./ReportControls";

/**
 * The monthly reports panel on a customer: what the customer was sent each month.
 *
 * Newest first, each with its lead sentence and where it got to. The office
 * can send one now, or again; the accountant reads them. Above the list, this
 * month to date as a PDF that is rendered and not kept — "how would this
 * look" before the 1st decides for everybody.
 */
export function CustomerReportsPanel({ customerId }: { customerId: string }) {
  // Keyed by customer so that going back or forward from one customer to
  // another remounts the panel: the rendered preview held by `FileOffer` is
  // the first customer's PDF and must never be offered under the second.
  return <ReportsPanelBody key={customerId} customerId={customerId} />;
}

function ReportsPanelBody({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { role } = useSession();
  const canSend = canSendReports(role);
  const query = useQuery(customerReportListQuery(customerReportPanelParams(customerId)));
  const opener = useOpenReport();
  const period = currentReportPeriod();

  return (
    <div className="flex flex-col gap-3">
      {canSend && (
        <div className="flex flex-col gap-1">
          <FileOffer
            label={t("report.previewThisMonth")}
            filename={t("report.previewFilename", { period })}
            fetchFile={() => previewCustomerReport({ customer: customerId, period })}
            canOpen
          />
          <span className="text-help text-muted-foreground">{t("report.previewHint")}</span>
        </div>
      )}

      {opener.failure && <p className="text-help text-destructive">{opener.failure}</p>}

      {query.isPending ? (
        <p className="text-help text-subtle">{t("common.loading")}</p>
      ) : query.isError ? (
        <p className="text-help text-destructive">{errorMessage(query.error, t)}</p>
      ) : query.data.results.length === 0 ? (
        <p className="text-help text-subtle">{t("report.noReportsForCustomer")}</p>
      ) : (
        <ul className="flex flex-col">
          {query.data.results.map((report) => (
            <ReportItem key={report.id} report={report} canSend={canSend} onOpen={opener.open} />
          ))}
        </ul>
      )}

      {query.data && query.data.pagination.total > query.data.results.length && (
        <Link
          to="/reports"
          search={{ customer: customerId }}
          className="self-start text-help text-primary hover:underline"
        >
          {t("report.viewAll", { count: query.data.pagination.total })}
        </Link>
      )}
    </div>
  );
}

function ReportItem({
  report,
  canSend,
  onOpen,
}: {
  report: CustomerReport;
  canSend: boolean;
  onOpen: (report: Pick<CustomerReport, "id">) => void;
}) {
  const { t } = useTranslation();
  const lead = leadSentence(report.summary, t);
  const recipients = recipientList(report.recipients);

  return (
    <li className="flex flex-col gap-1.5 border-b border-border-subtle py-2.5 last:border-0">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-cell font-medium">{reportMonth(report.period)}</span>
        <ReportDeliveryChip value={report.delivery} />
      </span>
      {lead && <span className="text-help text-muted-foreground">{lead}</span>}
      {report.sent_at && (
        <span className="text-help text-subtle">
          {t("report.sentTo", { when: formatDateTime(report.sent_at), recipients: recipients.join(", ") })}
        </span>
      )}
      {report.delivery === "failed" && report.error && (
        <span className="text-help text-destructive">{t("report.failedReason", { error: report.error })}</span>
      )}
      <span className="flex flex-wrap items-center justify-end gap-2">
        <DownloadReportButton report={report} onOpen={onOpen} />
        {canSend && <SendReportButton report={report} />}
      </span>
    </li>
  );
}
