import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MailX, Send } from "lucide-react";
import {
  invitationKeys,
  invitationListQuery,
  pendingInvitations,
  resendInvitation,
  revokeInvitation,
  type Invitation,
} from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { useSubmit } from "@/lib/form";
import { formatDateTime } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Stacked } from "@/components/list/ListPage";
import { RoleChip, StatusChip } from "@/components/ui/status-chip";

/**
 * The invitations nobody has accepted yet.
 *
 * Its own section under the members table rather than extra rows inside it. An
 * invitation is a different resource with its own paging, so interleaving the
 * two would leave the table's result counter describing a different number of
 * rows from the one on screen — and half the columns blank for half the rows,
 * since an invitation has no last login, no certificate and no assignments.
 *
 * Absent entirely when nothing is pending, which makes its presence the signal
 * that somebody is waiting.
 */
export function PendingInvitations() {
  const { t } = useTranslation();
  const query = useQuery(invitationListQuery());

  const [revoking, setRevoking] = useState<Invitation | null>(null);
  /**
   * Which row an action is aimed at. One mutation serves every row, so without
   * this the spinner would appear on all of them at once.
   */
  const [acting, setActing] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);

  const resend = useSubmit<string, Invitation>({
    mutationFn: (id) => resendInvitation(id),
    invalidate: [invitationKeys.all],
    onSuccess: (invitation) => setResent(invitation.id),
  });

  const revoke = useSubmit<string, void>({
    mutationFn: (id) => revokeInvitation(id),
    invalidate: [invitationKeys.all],
    onSuccess: () => setRevoking(null),
  });

  // Reported rather than hidden. Silence here is indistinguishable from "nobody
  // is waiting", which is the one wrong answer: an administrator would conclude
  // the invitation they sent this morning was never recorded.
  if (query.isError) {
    return (
      <section className="px-6 pb-8">
        <Alert tone="error" title={t("user.pendingFailed")}>
          <p className="text-help">{errorMessage(query.error, t)}</p>
        </Alert>
      </section>
    );
  }

  const rows = pendingInvitations(query.data);
  if (rows.length === 0) return null;

  const failure = resend.state.message || revoke.state.message;

  return (
    <section className="flex flex-col gap-3 px-6 pb-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-cardtitle">
          {t("user.pendingHeading")}{" "}
          <span className="tnum text-muted-foreground">({rows.length})</span>
        </h2>
        <p className="text-help text-muted-foreground">{t("user.pendingBody")}</p>
      </div>

      {/* Dashed, like every other system-assigned state in this system: nobody
          chose to be in this list, and nobody stays in it. */}
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-dashed border-border-strong bg-card">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-52 flex-1">
              <Stacked primary={`${row.first_name} ${row.last_name}`} secondary={row.email} />
            </div>

            <RoleChip value={row.role} />

            <div className="flex min-w-44 flex-col leading-tight">
              {/* `is_expired` is the server's own answer. Recomputing it from
                  the timestamp would put the client's clock in charge of
                  whether a link still works. */}
              {row.is_expired ? (
                <StatusChip weight="outline">{t("user.expired")}</StatusChip>
              ) : (
                <span className="tnum text-help text-muted-foreground">
                  {t("user.expiresAt", { date: formatDateTime(row.expires_at) })}
                </span>
              )}
              {row.invited_by_name && (
                <span className="text-help text-subtle">
                  {t("user.invitedBy", { name: row.invited_by_name })}
                </span>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1">
              {resent === row.id ? (
                <span className="px-2 text-help text-muted-foreground">{t("user.resent")}</span>
              ) : (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={resend.state.pending && acting === row.id}
                  onClick={() => {
                    setActing(row.id);
                    setResent(null);
                    resend.submit(row.id);
                  }}
                >
                  <Send />
                  {t("user.resend")}
                </Button>
              )}
              <Button size="xs" variant="ghost" onClick={() => setRevoking(row)}>
                <MailX />
                {t("user.revoke")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {failure && <p className="text-help text-destructive">{failure}</p>}

      <ConfirmDialog
        open={revoking !== null}
        title={t("user.revokeTitle")}
        body={t("user.revokeBody", { email: revoking?.email ?? "" })}
        confirmLabel={revoke.state.pending ? t("common.saving") : t("user.revokeConfirm")}
        onConfirm={() => {
          if (!revoking) return;
          setActing(revoking.id);
          revoke.submit(revoking.id);
        }}
        onCancel={() => setRevoking(null)}
      />
    </section>
  );
}
