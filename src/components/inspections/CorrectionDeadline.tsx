import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ShieldAlert } from "lucide-react";
import { toDisplay } from "@/lib/date";
import { cn } from "@/lib/utils";

/** The open correction of a lift's current inspection, as every lift read carries it. */
export interface OpenCorrection {
  correction_deadline: string | null;
  correction_days_left: number | null;
}

/**
 * "12.11.2026 · 21 days left" — the deadline and how long is left, or how long
 * ago it passed. Null when no defect is open: the server sends no date then.
 */
export function correctionSummary(lift: OpenCorrection, t: TFunction): string | null {
  if (!lift.correction_deadline || lift.correction_days_left === null) return null;
  const days = lift.correction_days_left;
  const left =
    days < 0
      ? t("inspection.daysPassed", { count: -days })
      : days === 0
        ? t("inspection.today")
        : t("inspection.daysLeft", { count: days });
  return `${toDisplay(lift.correction_deadline)} · ${left}`;
}

/**
 * A red or yellow label's legal deadline, in one line, shown beside the next
 * periodic inspection wherever that date is: a year-away inspection date on
 * its own reads as "nothing due" while a defect is days from ending in a seal.
 */
export function CorrectionDeadline({ lift, className }: { lift: OpenCorrection; className?: string }) {
  const { t } = useTranslation();
  const summary = correctionSummary(lift, t);
  if (!summary) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-help",
        (lift.correction_days_left ?? 0) < 0 && "font-semibold",
        className,
      )}
    >
      <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="tnum">
        {t("inspection.correctionDeadline")}: {summary}
      </span>
    </span>
  );
}
