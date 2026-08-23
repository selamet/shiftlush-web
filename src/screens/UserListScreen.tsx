import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { userListQuery, type TeamUser } from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { formatDateTime, formatDate } from "@/lib/format";
import { useListSearch } from "@/lib/list-search";
import { userFilters as filters } from "@/screens/list-searches";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { RoleChip, StatusChip } from "@/components/ui/status-chip";
import { PendingInvitations } from "@/components/users/PendingInvitations";

/** Certificates expire, and an expired one blocks the technician on site. */
const WARN_WITHIN_DAYS = 60;

function certificateState(validUntil: string | null): "none" | "ok" | "expiring" {
  if (!validUntil) return "none";
  const days = (new Date(validUntil).getTime() - Date.now()) / 86_400_000;
  return days <= WARN_WITHIN_DAYS ? "expiring" : "ok";
}

/**
 * The people who can sign in, and the invitations waiting to become people.
 *
 * The two lists are stacked rather than merged; see PendingInvitations for why.
 */
export function UserListScreen() {
  const { t } = useTranslation();
  const list = useListSearch(filters);

  const query = useQuery(userListQuery(list.params));
  const rows = query.data?.results ?? [];

  const columns: ListColumn<TeamUser>[] = [
    {
      key: "user.fields.firstName",
      sticky: true,
      cell: (row) => (
        <Link to="/users/$id" params={{ id: row.id }} className="hover:underline">
          <Stacked primary={row.full_name} secondary={row.email} />
        </Link>
      ),
    },
    { key: "user.fields.role", cell: (row) => <RoleChip value={row.role} /> },
    {
      key: "user.fields.phone",
      hideOnMobile: true,
      cell: (row) => row.phone || <span className="text-subtle">—</span>,
    },
    {
      key: "user.fields.certificateValidUntil",
      hideOnMobile: true,
      cell: (row) => {
        const state = certificateState(row.certificate_valid_until);
        if (state === "none") return <span className="text-subtle">—</span>;
        return (
          <span className="flex flex-col leading-tight">
            <span className={state === "expiring" ? "tnum text-warning" : "tnum"}>
              {formatDate(row.certificate_valid_until)}
            </span>
            {state === "expiring" && (
              <span className="flex items-center gap-1 text-help text-warning">
                <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                {row.certificate_number}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "user.fields.lastLoginAt",
      hideOnMobile: true,
      cell: (row) =>
        row.last_login_at ? (
          <span className="tnum text-muted-foreground">{formatDateTime(row.last_login_at)}</span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    {
      key: "user.fields.isActive",
      cell: (row) => {
        if (!row.is_active) return <StatusChip weight="recessed">{t("common.no")}</StatusChip>;
        // Verified is the expected state and stays silent. The exception earns
        // the chip, because an unverified colleague cannot invite anyone and
        // will otherwise discover that only when the send fails.
        if (!row.is_email_verified) {
          return <StatusChip weight="dashed">{t("user.unverified")}</StatusChip>;
        }
        return <StatusChip weight="silent">{t("common.yes")}</StatusChip>;
      },
    },
  ];

  return (
    <>
      <ListPage
        breadcrumbKey="nav.groups.administration"
        titleKey="user.title"
        primaryActionKey="user.actions.invite"
        // A route rather than a dialog: the shared list header renders its
        // primary action as a plain button with no click handler unless this is
        // set, and that component is not this screen's to change.
        primaryActionTo="/users/invite"
        state={list}
        filters={filters}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        total={query.data?.pagination.total ?? 0}
        loading={query.isPending}
        error={
          query.isError
            ? {
                message: errorMessage(query.error, t),
                reference: supportReference(query.error),
                onRetry: () => void query.refetch(),
              }
            : undefined
        }
        emptyTitleKey="empty.noUsers"
      />
      <PendingInvitations />
    </>
  );
}
