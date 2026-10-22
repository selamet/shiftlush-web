import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * List or calendar: the same plan rows, laid out by route or by day. Two
 * links rather than a toggle, so each view has its own address to share and
 * the browser's back button undoes a switch. Hidden on a phone, where the
 * calendar is not offered.
 */
export function PlanViewSwitch({ current }: { current: "list" | "calendar" }) {
  const { t } = useTranslation();
  const item = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-cell focus-ring",
      active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
    );
  return (
    <nav aria-label={t("plan.calendar.views")} className="hidden items-center gap-1 rounded-lg border border-border-subtle p-0.5 md:inline-flex">
      <Link to="/plan" className={item(current === "list")} aria-current={current === "list" ? "page" : undefined}>
        <List className="size-4" aria-hidden="true" />
        {t("plan.calendar.listView")}
      </Link>
      <Link
        to="/plan/calendar"
        className={item(current === "calendar")}
        aria-current={current === "calendar" ? "page" : undefined}
      >
        <CalendarDays className="size-4" aria-hidden="true" />
        {t("plan.calendar.calendarView")}
      </Link>
    </nav>
  );
}
