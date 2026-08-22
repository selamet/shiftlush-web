import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useSession, initials } from "@/lib/session";
import { enumLabel } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Role } from "./nav-config";

/**
 * Who is signed in, and the one action that ends it.
 *
 * The topbar showed the name, the role and an initials circle and offered
 * nothing to press, so `signOut` — which has existed since the session layer
 * was written — had no call site and the product had no way out. The identity
 * block is now the trigger rather than a second control beside it: it is
 * already the thing on screen that means "you", and pressing it is where
 * everyone looks first.
 *
 * The menu repeats the name and adds the company, which the trigger has no room
 * for below `sm`. On a shared workstation that line is the whole question the
 * person is asking when they open this.
 */
export function UserMenu({ fullName, role }: { fullName: string; role: Role }) {
  const { t } = useTranslation();
  const { companyName, signOut } = useSession();
  const navigate = useNavigate();

  const handleSignOut = () => {
    // Not awaited by the item: the menu has already closed, and the arrival at
    // /login is the feedback. Navigation comes after the call resolves, because
    // `signOut` is what clears the cached session the guard on /login reads —
    // navigating first would be sent straight back into the application.
    void (async () => {
      await signOut();
      await navigate({ to: "/login" });
    })();
  };

  return (
    <DropdownMenu
      label={t("nav.userMenu")}
      trigger={
        <>
          <div className="hidden flex-col items-end leading-tight sm:flex">
            <span className="text-label">{fullName}</span>
            <span className="text-help text-muted-foreground">{enumLabel("user.role", role)}</span>
          </div>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-label font-semibold text-primary">
            {initials(fullName)}
          </span>
        </>
      }
    >
      <DropdownMenuHeader>
        <span className="truncate text-label text-foreground">{fullName}</span>
        {companyName && (
          <span className="truncate text-help text-muted-foreground">{companyName}</span>
        )}
      </DropdownMenuHeader>

      <DropdownMenuSeparator />

      {/* Where people look for their own password and their own sessions —
          under their own name, not under the firm's settings. */}
      <DropdownMenuItem icon={UserRound} to="/settings/profile">
        {t("settings.profileTab")}
      </DropdownMenuItem>

      <DropdownMenuItem icon={Settings} to="/settings">
        {t("nav.settings")}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem icon={LogOut} destructive onSelect={handleSignOut}>
        {t("auth.logout")}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}
