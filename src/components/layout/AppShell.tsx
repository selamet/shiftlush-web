import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Menu, X, Moon, Sun, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerificationBanner } from "@/components/layout/VerificationBanner";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { enumLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { UserMenu } from "./UserMenu";
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
        {fullName && role && <UserMenu fullName={fullName} role={role} />}
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

  // A drawer left open while the window grows into the desktop layout is
  // hidden by `lg:hidden` — but a hidden modal still holds the keyboard and
  // still inerts the page behind it, which locks the window with nothing on
  // screen to explain why. At that width the sidebar is already there, so the
  // drawer has nothing left to show.
  useEffect(() => {
    if (!drawerOpen) return;

    const desktop = window.matchMedia("(min-width: 64rem)");
    const close = () => {
      if (desktop.matches) setDrawerOpen(false);
    };

    close();
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, [drawerOpen]);

  // Someone who has just signed out, or whose session expired on a screen the
  // guard cannot re-check, is on their way to /login. Rendering the skeletons
  // in the meantime puts `boot.refreshingSession` on screen, which tells them
  // the opposite of what is happening.
  if (status === "anonymous") return null;

  const restoring = status === "restoring" || role === null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div data-app-chrome className="hidden lg:block">
        {restoring ? <SidebarSkeleton /> : <Sidebar role={role} />}
      </div>

      {/* A drawer is a dialog: it covers the page, and the page underneath has
          to be out of reach while it does. Closing hands focus back to the
          menu button in the topbar — the close control lives inside the thing
          it unmounts, so without that, focus lands on `<body>` and the next Tab
          starts again from the top of the page. */}
      {drawerOpen && !restoring && (
        <Modal
          open
          onClose={() => setDrawerOpen(false)}
          label={t("nav.menu")}
          placement="inline-start"
          overlayClassName="lg:hidden"
          className="w-64"
        >
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
        </Modal>
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
