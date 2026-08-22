import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Menu, X, Moon, Sun, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerificationBanner } from "@/components/layout/VerificationBanner";
import { useSession, initials } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { enumLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarNav, SidebarSkeleton } from "./Sidebar";
import { ROLES, type Role } from "./nav-config";

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t } = useTranslation();
  const { fullName, role, setRole } = useSession();
  const { theme, toggle } = useTheme();

  return (
    <header
      data-app-chrome
      className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-card px-4"
    >
      <Button
        size="icon"
        variant="ghost"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label={t("nav.openMenu")}
      >
        <Menu />
      </Button>

      <label className="relative hidden min-w-0 flex-1 items-center sm:flex">
        <Search
          className="pointer-events-none absolute left-3 size-4 text-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder={t("nav.globalSearch")}
          className="h-control-sm w-full max-w-md rounded-md border border-input bg-background pl-9 pr-3 text-body placeholder:text-subtle focus-ring"
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        {/* Dev affordance: the role normally comes from the session. It is
            exposed here so the role-scoped navigation and the hidden financial
            fields can be reviewed without five accounts. Remove once the real
            auth flow lands. */}
        {role && (
          <label className="hidden items-center gap-1.5 rounded-sm bg-muted py-1 pl-2 pr-1 md:inline-flex">
            <FlaskConical className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
            <span className="sr-only">{t("user.fields.role")}</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className="cursor-pointer border-0 bg-transparent pr-1 text-help text-muted-foreground focus-ring"
            >
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {enumLabel("user.role", value)}
                </option>
              ))}
            </select>
          </label>
        )}
        <Button size="icon" variant="ghost" onClick={toggle} aria-label={t("styleguide.toggleTheme")}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
        {fullName && role && (
          <div className="flex items-center gap-2.5 pl-1">
            <div className="hidden flex-col items-end leading-tight sm:flex">
              <span className="text-label">{fullName}</span>
              <span className="text-help text-muted-foreground">
                {enumLabel("user.role", role)}
              </span>
            </div>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-label font-semibold text-primary">
              {initials(fullName)}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

function TopbarSkeleton() {
  return (
    <header
      data-app-chrome
      className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-card px-4"
    >
      <div className="h-control-sm w-full max-w-md rounded-md bg-muted" />
      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden h-6 w-28 rounded-xs bg-muted sm:block" />
        <div className="size-8 rounded-full bg-muted" />
      </div>
    </header>
  );
}

/**
 * The application frame.
 *
 * During session restore the shell is rendered at full fidelity and only the
 * role-dependent parts are skeletons, so the layout does not shift when the
 * session lands. No full-page spinner, no white screen — see SidebarSkeleton.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { status, role } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const restoring = status === "restoring" || role === null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div data-app-chrome className="hidden lg:block">
        {restoring ? <SidebarSkeleton /> : <Sidebar role={role} />}
      </div>

      {drawerOpen && !restoring && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setDrawerOpen(false)}
            aria-label={t("nav.closeMenu")}
          />
          <div className="relative flex w-64 flex-col bg-card shadow-lg">
            <div className="flex justify-end p-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("nav.closeMenu")}
              >
                <X />
              </Button>
            </div>
            <SidebarNav role={role} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {restoring ? <TopbarSkeleton /> : <Topbar onOpenMenu={() => setDrawerOpen(true)} />}
        {/* Below the topbar and above the content: it belongs to the account,
            not to the page, and it must not move when the page changes. */}
        {!restoring && <VerificationBanner />}
        <main data-app-main className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
        {restoring && (
          <div
            role="status"
            className={cn(
              "flex h-8 shrink-0 items-center justify-center gap-2",
              "border-t border-border-subtle bg-muted text-help text-muted-foreground",
            )}
          >
            {t("boot.refreshingSession")}
          </div>
        )}
      </div>
    </div>
  );
}
