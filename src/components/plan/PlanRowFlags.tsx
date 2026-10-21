import { useTranslation } from "react-i18next";
import type { PlannedVisit } from "@/api/queries";
import { PlanFlagChips } from "@/components/ui/status-chip";
import { enumLabel } from "@/lib/i18n";
import { triedNotDone } from "@/lib/plan";

/**
 * A plan row's flags, worded the same on the office plan, the technician's
 * list and the lift's card. Overdue says by how long when the server knows:
 * "12 days overdue" tells the office which lift to send somebody to first, and
 * a row carried over from last month is no longer read as due on the 1st.
 */
export function PlanRowFlags({ row }: { row: PlannedVisit }) {
  const { t } = useTranslation();
  return (
    <PlanFlagChips
      overdue={row.is_overdue}
      tried={triedNotDone(row)}
      overdueLabel={
        row.days_overdue
          ? t("plan.flags.overdueDays", { days: row.days_overdue })
          : t("plan.flags.overdue")
      }
      triedLabel={t("plan.flags.tried", {
        status: enumLabel("visit.status", row.latest_visit_status),
      })}
    />
  );
}
