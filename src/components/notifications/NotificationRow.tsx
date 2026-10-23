import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  markAllNotificationsRead,
  markNotificationRead,
  notificationKeys,
  type AppNotification,
} from "@/api/queries";
import { formatDateTime } from "@/lib/format";
import { describeNotification, notificationTarget, relativeTime } from "@/lib/notifications";
import { cn } from "@/lib/utils";

/**
 * Marking one read.
 *
 * The invalidation sits on the mutation rather than on the call, because the
 * call is usually made by a click that also navigates: the row that made it is
 * gone by the time the server answers, and a callback attached to the call
 * would be dropped with it — leaving the bell showing a count that is one too
 * high until the next poll.
 */
export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/**
 * One notification: the sentence, when, and whether it has been read.
 *
 * Unread is marked three ways, never by colour alone: a heavier title, a dot,
 * and a "Yeni" tag a screen reader also hears. The tint behind an unread row
 * is a courtesy on top; on a washed-out screen, or to a reader who cannot tell
 * the tint apart, the weight and the word still say it.
 *
 * The whole row is the link to the record it is about, and following it is
 * what marks it read — opening the contract is the reading. A row about a
 * record this client has no screen for is a button that only marks it read.
 */
export function NotificationRow({
  notification,
  compact,
  onFollow,
}: {
  notification: AppNotification;
  /** The bell's panel: the title only, no full sentence. */
  compact?: boolean;
  /** Called after the row is activated — the panel closes itself with this. */
  onFollow?: () => void;
}) {
  const { t } = useTranslation();
  const markRead = useMarkRead();
  const words = describeNotification(notification, t);
  const target = notificationTarget(notification);
  const unread = notification.read_at === null;

  const follow = () => {
    if (unread) markRead.mutate(notification.id);
    onFollow?.();
  };

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="flex items-start justify-between gap-2">
          <span className={cn("text-cell", unread ? "font-semibold" : "text-muted-foreground")}>
            {words.title}
          </span>
          {unread && (
            <span className="shrink-0 rounded-sm border border-border-strong px-1.5 text-help font-medium">
              {t("notification.unreadTag")}
            </span>
          )}
        </span>
        {!compact && <span className="text-body text-muted-foreground">{words.body}</span>}
        <time
          dateTime={notification.created_at}
          title={formatDateTime(notification.created_at)}
          className="text-help text-subtle"
        >
          {relativeTime(notification.created_at, t)}
        </time>
      </span>
    </>
  );

  const className = cn(
    "flex w-full items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted focus-ring",
    unread && "bg-primary-soft/40",
  );

  return target ? (
    <Link
      to={target.to}
      params={target.params}
      search={"search" in target ? target.search : undefined}
      onClick={follow}
      className={className}
    >
      {content}
    </Link>
  ) : (
    <button type="button" onClick={follow} className={className}>
      {content}
    </button>
  );
}
