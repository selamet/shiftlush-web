import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, Send } from "lucide-react";
import {
  customerReportDownloadUrl,
  reportKeys,
  sendCustomerReport,
  type CustomerReport,
} from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { monthYearLabel } from "@/lib/date";
import { openSignedUrl } from "@/lib/open-signed-url";
import { useSubmit } from "@/lib/form";
import { sendLabelKey } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** A report's month as people say it: "Ekim 2026". */
export function reportMonth(period: string): string {
  return monthYearLabel(`${period}-01`) || period;
}

/**
 * Opens a report's PDF through a freshly signed link, and says so in words if
 * it cannot. The link is asked for at the moment of the click and never kept:
 * the bucket is private and every read is a new signature.
 */
export function useOpenReport() {
  const { t } = useTranslation();
  const [failure, setFailure] = useState("");
  async function open(report: Pick<CustomerReport, "id">) {
    setFailure("");
    try {
      await openSignedUrl(async () => (await customerReportDownloadUrl(report.id)).download_url);
    } catch (error) {
      setFailure(errorMessage(error, t));
    }
  }
  return { open, failure };
}

export function DownloadReportButton({
  report,
  onOpen,
}: {
  report: Pick<CustomerReport, "id" | "file">;
  onOpen: (report: Pick<CustomerReport, "id">) => void;
}) {
  const { t } = useTranslation();
  return (
    <Button size="sm" variant="ghost" disabled={!report.file} onClick={() => onOpen(report)}>
      <FileDown />
      {report.file ? t("report.download") : t("report.noFile")}
    </Button>
  );
}

/**
 * "Send", or "send again", behind a confirmation — it e-mails a customer.
 *
 * One idempotency key per intention: minted with the button, kept across a
 * failure so that pressing again after a dropped connection is the same send,
 * and minted afresh after a success so that a deliberate second send is not
 * answered with the first one's result.
 */
export function SendReportButton({ report }: { report: CustomerReport }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const send = useSubmit<string, CustomerReport>({
    mutationFn: (id) => sendCustomerReport(id, key),
    invalidate: [reportKeys.all],
    onSuccess: () => setKey(crypto.randomUUID()),
  });

  const month = reportMonth(report.period);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={send.state.pending} onClick={() => setConfirming(true)}>
        <Send />
        {t(sendLabelKey(report))}
      </Button>
      {send.state.message && <span className="text-help text-destructive">{send.state.message}</span>}
      <ConfirmDialog
        open={confirming}
        title={t("report.sendTitle")}
        body={t(report.sent_at ? "report.resendBody" : "report.sendBody", {
          customer: report.customer_name,
          month,
        })}
        confirmLabel={t(sendLabelKey(report))}
        onConfirm={() => {
          setConfirming(false);
          send.submit(report.id);
        }}
        onCancel={() => setConfirming(false)}
      />
    </span>
  );
}
