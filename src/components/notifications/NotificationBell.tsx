import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { notificationListQuery, unreadCountQuery } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { badgeLabel } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationRow, useMarkAllRead } from "./NotificationRow";

/** How many the panel shows. The rest are a link away. */
const PANEL_SIZE = 8;

/**
 * The bell in the top bar, and the panel it opens.
 *
 * A popover, not a dialog. Nothing behind it becomes unreachable while it is
 * open — it is a glance at the latest few, and the person may well click
 * straight past it into the page — so it claims no modal containment, traps
 * nothing, and closes the way the user menu beside it does: Escape (with focus
 * back on the bell), a press anywhere outside, or following one of its links.
 * The trigger says whether it is open with `aria-expanded`, and the panel is a
 * labelled region the trigger points at.
 *
 * The list is fetched when the panel opens rather than with every page: the
 * count is the part that has to be current, and it has its own small request.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const count = useQuery(unreadCountQuery());
  const latest = useQuery({ ...notificationListQuery({ page_size: PANEL_SIZE }), enabled: open });
  const markAll = useMarkAllRead();

  const unread = count.data?.count ?? 0;
  const badge = badgeLabel(unread);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const rows = latest.data?.results ?? [];

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        size="icon"
        variant="ghost"
        aria-expanded={open}
        aria-controls={panelId}
        // The count is in the name, so a screen reader hears it on the bell
        // rather than having to find the badge.
        aria-label={unread > 0 ? t("notification.bellUnread", { count: unread }) : t("notification.bell")}
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Bell />
        {badge && (
          <span
            aria-hidden="true"
            className="tnum absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
          >
            {badge}
          </span>
        )}
      </Button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={t("notification.title")}
          className="absolute right-0 top-full z-40 mt-2 flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
            <h2 className="text-label">{t("notification.title")}</h2>
            <Button
              size="xs"
              variant="ghost"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck aria-hidden="true" />
              {markAll.isPending ? t("notification.markingAllRead") : t("notification.markAllRead")}
            </Button>
          </div>

          <div className="max-h-[min(28rem,70vh)] overflow-y-auto">
            {latest.isPending && (
              <p className="px-3 py-4 text-help text-subtle">{t("common.loading")}</p>
            )}
            {latest.isError && (
              <p className="px-3 py-4 text-help text-destructive">{errorMessage(latest.error, t)}</p>
            )}
            {markAll.isError && (
              <p className="px-3 py-2 text-help text-destructive">{errorMessage(markAll.error, t)}</p>
            )}
            {latest.isSuccess && rows.length === 0 && (
              <p className="px-3 py-6 text-center text-help text-muted-foreground">
                {t("notification.empty")}
              </p>
            )}
            {rows.length > 0 && (
              <ul className="divide-y divide-border-subtle">
                {rows.map((notification) => (
                  <li key={notification.id}>
                    <NotificationRow
                      notification={notification}
                      compact
                      onFollow={() => close(false)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            to="/notifications"
            onClick={() => close(false)}
            className={cn(
              "border-t border-border-subtle px-3 py-2.5 text-center text-help font-medium text-primary hover:bg-muted focus-ring",
            )}
          >
            {t("notification.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
