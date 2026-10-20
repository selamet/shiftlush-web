import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BellOff, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { notificationListQuery, unreadCountQuery } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { useListSearch } from "@/lib/list-search";
import { notificationFilters as filters } from "@/screens/list-searches";
import { ListError, TableSkeleton } from "@/components/list/ListStates";
import { NotificationRow, useMarkAllRead } from "@/components/notifications/NotificationRow";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";

/**
 * Every notification the signed-in person has, newest first.
 *
 * Not the shared table list. A notification is a sentence, not a set of
 * columns, and squeezed into cells it would be read as one; so this is a plain
 * list that keeps the shared list's other promise instead — the filter and the
 * page are in the address bar, under the names the endpoint takes.
 */
export function NotificationListScreen() {
  const { t } = useTranslation();
  const list = useListSearch(filters);
  const unreadOnly = list.filters.unread === "true";

  const query = useQuery(notificationListQuery(list.params));
  const count = useQuery(unreadCountQuery());
  const markAll = useMarkAllRead();

  const rows = query.data?.results ?? [];
  const pages = query.data?.pagination.total_pages ?? 1;
  const unread = count.data?.count ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-title">{t("notification.title")}</h1>
        <Button
          size="sm"
          variant="secondary"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          <CheckCheck aria-hidden="true" />
          {markAll.isPending ? t("notification.markingAllRead") : t("notification.markAllRead")}
        </Button>
      </div>

      <Segmented
        name="notification-filter"
        label={t("notification.filterLabel")}
        labelHidden
        className="max-w-xs"
        options={[
          { value: "all", label: t("notification.filterAll") },
          { value: "unread", label: t("notification.filterUnread") },
        ]}
        value={unreadOnly ? "unread" : "all"}
        onChange={(value) => list.setFilter("unread", value === "unread" ? "true" : null)}
      />

      {markAll.isError && <Alert tone="error" block title={errorMessage(markAll.error, t)} />}

      {query.isPending ? (
        <TableSkeleton columns={1} rows={6} />
      ) : query.isError ? (
        <ListError
          message={errorMessage(query.error, t)}
          reference={supportReference(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <BellOff className="size-8 text-subtle" aria-hidden="true" />
          <p className="text-body text-muted-foreground">
            {unreadOnly ? t("notification.emptyUnread") : t("notification.empty")}
          </p>
          <p className="text-help text-subtle">{t("notification.emptyHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-card">
          {rows.map((notification) => (
            <li key={notification.id}>
              <NotificationRow notification={notification} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label={t("notification.title")}>
          <Button
            size="sm"
            variant="secondary"
            disabled={list.page <= 1}
            onClick={() => list.setPage(list.page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            {t("notification.previousPage")}
          </Button>
          <span className="tnum text-help text-muted-foreground">
            {t("notification.pageOf", { page: list.page, pages })}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={list.page >= pages}
            onClick={() => list.setPage(list.page + 1)}
          >
            {t("notification.nextPage")}
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
