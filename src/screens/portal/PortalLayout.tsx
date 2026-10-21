import { useTranslation } from "react-i18next";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Building2, LogOut, Phone } from "lucide-react";
import { usePortalSession } from "@/lib/portal-session";
import { cn } from "@/lib/utils";

/**
 * The portal's frame: who this is for, who to call, and two places to go.
 *
 * Deliberately plain. The reader is a building manager checking on their lifts
 * between other things, not somebody who uses this every day: the customer's
 * name so they know they are in the right place, the firm's phone number in
 * the header because the most useful thing the portal can do in a bad moment
 * is put that number one tap away, and nothing else to learn.
 */
export function PortalLayout() {
  const { t } = useTranslation();
  const { me, signOut } = usePortalSession();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border-subtle bg-card">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="flex items-center gap-1.5 text-cardtitle">
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{me?.customer_name}</span>
            </span>
            <span className="text-help text-muted-foreground">
              {t("portal.servicedBy", { firm: me?.company_name ?? "" })}
            </span>
          </div>
          {me?.company_phone && (
            <a
              href={`tel:${me.company_phone}`}
              className="inline-flex min-h-control-lg items-center gap-2 rounded-md border border-border px-3 text-body font-medium hover:bg-muted focus-ring"
            >
              <Phone className="size-4" aria-hidden="true" />
              {t("portal.callUs", { phone: me.company_phone })}
            </a>
          )}
        </div>
        <nav className="mx-auto flex w-full max-w-3xl items-center gap-1 px-4 pb-2">
          <PortalNavLink to="/portal" label={t("portal.nav.lifts")} exact />
          <PortalNavLink to="/portal/faults" label={t("portal.nav.faults")} />
          <button
            type="button"
            onClick={() =>
              void (async () => {
                await signOut();
                await navigate({ to: "/portal/login" });
              })()
            }
            className="ml-auto inline-flex min-h-control-md items-center gap-1.5 rounded-md px-2 text-help text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            {t("portal.signOut")}
          </button>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}

function PortalNavLink({ to, label, exact }: { to: string; label: string; exact?: boolean }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className={cn(
        "inline-flex min-h-control-md items-center rounded-md px-3 text-body text-muted-foreground hover:text-foreground focus-ring",
        "data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

/** The signed-out pages' frame: one narrow card, nothing that needs a session. */
export function PortalPublicFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-10">
        <div className="flex flex-col gap-1">
          <span className="text-help text-muted-foreground">{t("portal.brand")}</span>
          <h1 className="text-title">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}
