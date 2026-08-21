import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Menu, X, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession, initials } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { enumLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Sidebar, SidebarNav, SidebarSkeleton } from "./Sidebar";

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t } = useTranslation();
  const { fullName, role } = useSession();
  const { theme, toggle } = useTheme();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-card px-4">
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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-card px-4">
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
      <div className="hidden lg:block">
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
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
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
