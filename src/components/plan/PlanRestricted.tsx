import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";
import { useSession } from "@/lib/session";
import { homePath } from "@/lib/plan";

/**
 * What a role gets on a plan screen that is not theirs.
 *
 * The accountant has no part in the plan at all; a technician who lands on the
 * office's month view has their own lists, and is pointed at them. Said before
 * any request, the way the audit trail and the visit screens do it, rather
 * than explained after a 403.
 */
export function PlanRestricted({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  const { role } = useSession();
  return (
    <div className="flex flex-col gap-3 px-6 py-16 text-center">
      <ShieldOff className="size-8 self-center text-subtle" aria-hidden="true" />
      <p className="text-body text-muted-foreground">{t(titleKey)}</p>
      {role === "technician" ? (
        <Link to={homePath(role)} className="self-center text-body text-primary hover:underline">
          {t("plan.goToToday")}
        </Link>
      ) : (
        <p className="text-help text-subtle">{t("plan.restrictedHint")}</p>
      )}
    </div>
  );
}
