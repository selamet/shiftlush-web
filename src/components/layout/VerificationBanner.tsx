import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MailWarning } from "lucide-react";
import { resendVerification } from "@/api/queries";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

/**
 * Says why inviting colleagues is unavailable, and offers the way out.
 *
 * A restriction with no explanation reads as a broken feature. This one is
 * narrow — everything except sending invitations still works — so the banner
 * says what is blocked rather than implying the account is limited in general.
 *
 * Not dismissible. It describes a state that is still true after it is closed,
 * and the action that resolves it is inside the banner. But it is one line at
 * every width: on a phone the full sentence wrapped to four lines and pushed
 * every page's title halfway down the first screen, on every page. The phone
 * gets the short form; the full sentence is its accessible description.
 */
export function VerificationBanner() {
  const { t } = useTranslation();
  const { status, emailVerified } = useSession();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (status !== "authenticated" || emailVerified) return null;

  async function resend() {
    setSending(true);
    try {
      await resendVerification();
      setSent(true);
    } finally {
      // Even on failure: the endpoint answers the same way regardless, and a
      // button stuck in "sending" is worse than one that can be pressed again.
      setSending(false);
    }
  }

  return (
    <div
      role="status"
      className="flex items-center gap-x-3 border-b border-warning bg-warning-bg px-4 py-1.5 text-help text-warning sm:px-6"
    >
      <MailWarning className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden min-w-0 sm:inline">{t("auth.unverifiedBanner")}</span>
      <span className="min-w-0 truncate sm:hidden" title={t("auth.unverifiedBanner")}>
        {t("auth.unverifiedBannerShort")}
      </span>
      {sent ? (
        <span className="ml-auto shrink-0 font-medium sm:ml-0">{t("auth.verificationSent")}</span>
      ) : (
        <Button
          size="xs"
          variant="secondary"
          className="ml-auto shrink-0 sm:ml-0"
          onClick={() => void resend()}
          disabled={sending}
        >
          {sending ? t("common.sending") : t("auth.resendVerification")}
        </Button>
      )}
    </div>
  );
}
