import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type TechnicianTab = "today" | "week" | "faults";

const TABS: Array<{ key: TechnicianTab; to: string; labelKey: string }> = [
  { key: "today", to: "/today", labelKey: "plan.today" },
  { key: "week", to: "/week", labelKey: "plan.week" },
  { key: "faults", to: "/my-faults", labelKey: "fault.mine" },
];

/**
 * The technician's three lists, side by side: the day's route, the week's,
 * and the faults given to them.
 *
 * Links rather than buttons, so each list has its own address — the landing
 * route is one of them — and each tab is a full gloved-hand target. A fault
 * count rides on its tab when there is one, because a fault given to them
 * mid-route is the thing that should change what they do next.
 */
export function TechnicianTabs({ active, faultCount }: { active: TechnicianTab; faultCount?: number }) {
  const { t } = useTranslation();
  return (
    <nav className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted p-1">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "flex min-h-control-lg items-center justify-center gap-1.5 rounded-md px-1 text-center text-body leading-tight transition-colors focus-ring",
            active === tab.key
              ? "border border-border-strong bg-card font-medium text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(tab.labelKey)}
          {tab.key === "faults" && faultCount ? (
            <span className="tnum rounded-full bg-muted px-1.5 text-help font-semibold text-foreground">
              {faultCount}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
