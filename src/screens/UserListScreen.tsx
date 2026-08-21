import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import users from "@fixtures/demo-users.json";
import { formatDateTime, formatDate } from "@/lib/format";
import { ListPage, Stacked, type ListColumn } from "@/components/list/ListPage";
import { RoleChip, StatusChip } from "@/components/ui/status-chip";

type User = (typeof users)[number];

/** Certificates expire, and an expired one blocks the technician on site. */
const WARN_WITHIN_DAYS = 60;

function certificateState(validUntil: string | null): "none" | "ok" | "expiring" {
  if (!validUntil) return "none";
  const days = (new Date(validUntil).getTime() - Date.parse("2026-08-21T00:00:00Z")) / 86_400_000;
  return days <= WARN_WITHIN_DAYS ? "expiring" : "ok";
}

export function UserListScreen() {
  const { t } = useTranslation();

  const columns: ListColumn<User>[] = [
    {
      key: "user.fields.firstName",
      sticky: true,
      cell: (row) => <Stacked primary={row.full_name} secondary={row.email} />,
    },
    { key: "user.fields.role", cell: (row) => <RoleChip value={row.role} /> },
    {
      key: "user.fields.phone",
      hideOnMobile: true,
      cell: (row) => row.phone ?? <span className="text-subtle">—</span>,
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
        // An invitation that has not been accepted is a system-assigned state
        // the admin cannot choose, so it takes the dashed treatment.
        if (row.invited) return <StatusChip weight="dashed">{t("user.invitePending")}</StatusChip>;
        return row.is_active ? (
          <StatusChip weight="silent">{t("common.yes")}</StatusChip>
        ) : (
          <StatusChip weight="recessed">{t("common.no")}</StatusChip>
        );
      },
    },
  ];

  return (
    <ListPage
      breadcrumbKey="nav.groups.administration"
      titleKey="user.title"
      primaryActionKey="user.actions.invite"
      filters={[{ labelKey: "user.fields.role" }, { labelKey: "user.fields.isActive" }]}
      columns={columns}
      rows={users}
      rowKey={(row) => row.id}
      total={users.length}
      emptyTitleKey="empty.noUsers"
    />
  );
}
