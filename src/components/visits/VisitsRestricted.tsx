import { useTranslation } from "react-i18next";
import { ShieldOff } from "lucide-react";

/**
 * What a role that may not see maintenance visits gets instead of the screen.
 *
 * The accountant has no visit entry point anywhere — not in the sidebar, not on
 * the elevator — but a pasted link or a bookmark still lands here. The screen
 * says why up front rather than making the request and explaining a 403 after
 * the fact, the same arrangement the audit trail uses.
 */
export function VisitsRestricted() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 px-6 py-16 text-center">
      <ShieldOff className="size-8 self-center text-subtle" aria-hidden="true" />
      <p className="text-body text-muted-foreground">{t("visit.restricted")}</p>
      <p className="text-help text-subtle">{t("visit.restrictedHint")}</p>
    </div>
  );
}
