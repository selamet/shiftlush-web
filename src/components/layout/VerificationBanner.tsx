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
 * and the action that resolves it is inside the banner.
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
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-warning bg-warning-bg px-6 py-2 text-help text-warning"
    >
      <MailWarning className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{t("auth.unverifiedBanner")}</span>
      {sent ? (
        <span className="font-medium">{t("auth.verificationSent")}</span>
      ) : (
        <Button size="xs" variant="secondary" onClick={() => void resend()} disabled={sending}>
          {sending ? t("common.sending") : t("auth.resendVerification")}
        </Button>
      )}
    </div>
  );
}
