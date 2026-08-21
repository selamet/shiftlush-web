import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import {
  DEMO_COUNTS,
  itemBadgeKey,
  itemLabelKey,
  visibleGroups,
  type Role,
} from "./nav-config";

function Brand() {
  const { companyName } = useSession();
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect
          x="3.6"
          y="2.6"
          width="24.8"
          height="26.8"
          rx="4.2"
          stroke="currentColor"
          strokeWidth="2.6"
          className="text-primary"
        />
        <rect x="9" y="6.6" width="14" height="10.4" rx="1.6" fill="currentColor" className="text-primary" />
        <path
          d="M9.4 21.6h13.2M9.4 25.4h13.2"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          className="text-primary"
        />
      </svg>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-body font-semibold tracking-tight">ShiftLush</span>
        {companyName && (
          <span className="truncate text-help text-muted-foreground">{companyName}</span>
        )}
      </div>
    </div>
  );
}

export function SidebarNav({ role }: { role: Role }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const groups = visibleGroups(role);

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-2">
      {groups.map((group) => (
        <div key={group.labelKey} className="flex flex-col gap-0.5">
          <span className="px-2 pb-1 text-colhead uppercase text-subtle">
            {t(group.labelKey)}
          </span>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            const badgeKey = itemBadgeKey(item, role);
            const count = DEMO_COUNTS[item.to]?.[role];

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-control-sm items-center gap-2.5 rounded-md px-2 text-body transition-colors",
                  "pointer-coarse:h-control-md",
                  active
                    ? "bg-selected font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{t(itemLabelKey(item, role))}</span>
                {badgeKey && (
                  <span className="rounded-sm border border-dashed border-border-strong px-1.5 text-help text-subtle">
                    {t(badgeKey)}
                  </span>
                )}
                {count != null && (
                  <span className="tnum text-help text-subtle">{count}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ role }: { role: Role }) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border-subtle bg-card">
      <Brand />
      <SidebarNav role={role} />
      <div className="border-t border-border-subtle p-2">
        <Link
          to="/settings"
          className={cn(
            "flex h-control-sm items-center gap-2.5 rounded-md px-2 text-body transition-colors",
            pathname.startsWith("/settings")
              ? "bg-selected font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Settings className="size-4 shrink-0" aria-hidden="true" />
          {t("company.title")}
        </Link>
      </div>
    </div>
  );
}

/**
 * The sidebar during session restore.
 *
 * The role is unknown until the refresh call returns, so the menu items cannot
 * be drawn — but everything that does not depend on the role can be, and is:
 * the shell, the logo, the exact row heights and group spacing. When the
 * session arrives nothing moves; the grey bars simply become text.
 */
export function SidebarSkeleton() {
  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border-subtle bg-card">
      <Brand />
      <div className="flex flex-1 flex-col gap-5 px-2 py-2">
        {[4, 1, 1].map((count, group) => (
          <div key={group} className="flex flex-col gap-0.5">
            <div className="mx-2 mb-1 h-2.5 w-16 rounded-xs bg-muted" />
            {Array.from({ length: count }).map((_, row) => (
              <div key={row} className="flex h-control-sm items-center gap-2.5 px-2">
                <div className="size-4 shrink-0 rounded-xs bg-muted" />
                <div className="h-3 flex-1 rounded-xs bg-muted" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-border-subtle p-2">
        <div className="flex h-control-sm items-center gap-2.5 px-2">
          <div className="size-4 shrink-0 rounded-xs bg-muted" />
          <div className="h-3 w-24 rounded-xs bg-muted" />
        </div>
      </div>
    </div>
  );
}
