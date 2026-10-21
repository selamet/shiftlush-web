import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserX } from "lucide-react";
import {
  deactivatePortalAccount,
  invitePortalContact,
  portalAccessKeys,
  portalAccountsQuery,
  type Customer,
  type PortalAccount,
} from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { formatDateTime } from "@/lib/format";
import { enumLabel } from "@/lib/i18n";
import { portalAccessFor } from "@/lib/portal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusChip } from "@/components/ui/status-chip";

/** Weight per account state: active is the expected one and stays quiet. */
const STATE_WEIGHT = { none: "recessed", invited: "dashed", active: "silent", inactive: "recessed" } as const;

/**
 * "Portal access": which of the customer's contacts can sign in to the
 * customer portal, and the office's three things to do about it.
 *
 * One row per contact rather than per account, because the office thinks in
 * people — "has the building manager got access?" — and a contact who has
 * never been invited is the row most worth seeing. Whether the invite button
 * is offered, and why not, comes from lib/portal: no e-mail, or already
 * active, is said on the row instead of discovered as a refusal.
 */
export function PortalAccessCard({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const accounts = useQuery(portalAccountsQuery(customer.id));
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PortalAccount | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: portalAccessKeys.accounts(customer.id) });
  const invite = useMutation({
    mutationFn: (contactId: string) => invitePortalContact(customer.id, contactId),
    onSuccess: async (_, contactId) => {
      setSentTo(contactId);
      await refresh();
    },
  });
  const deactivate = useMutation({
    mutationFn: (accountId: string) => deactivatePortalAccount(accountId),
    onSuccess: refresh,
  });

  if (accounts.isPending) return <p className="text-help text-subtle">{t("common.loading")}</p>;
  if (accounts.isError) return <p className="text-help text-destructive">{errorMessage(accounts.error, t)}</p>;

  const contacts = customer.contacts ?? [];
  const failure = invite.error ?? deactivate.error;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-help text-muted-foreground">{t("portalAccess.intro")}</p>
      {failure && <Alert tone="error" block title={errorMessage(failure, t)} />}
      {contacts.length === 0 ? (
        <p className="text-help text-subtle">{t("portalAccess.noContacts")}</p>
      ) : (
        <ul className="flex flex-col">
          {contacts.map((contact) => {
            const access = portalAccessFor(contact, accounts.data.results);
            return (
              <li key={contact.id} className="flex flex-col gap-1.5 border-b border-border-subtle py-2.5 last:border-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-cell">{contact.full_name}</span>
                    <span className="truncate text-help text-muted-foreground">
                      {contact.email || t("portalAccess.noEmail")}
                    </span>
                  </span>
                  <StatusChip weight={STATE_WEIGHT[access.state]}>
                    {enumLabel("portalAccess.state", access.state)}
                  </StatusChip>
                </div>
                {access.account?.last_login_at && (
                  <p className="text-help text-subtle">
                    {t("portalAccess.lastLogin", { at: formatDateTime(access.account.last_login_at) })}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {access.canInvite && (
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={invite.isPending}
                      onClick={() => invite.mutate(contact.id)}
                    >
                      <Mail aria-hidden="true" />
                      {access.state === "none" ? t("portalAccess.invite") : t("portalAccess.reinvite")}
                    </Button>
                  )}
                  {access.blocked === "noEmail" && (
                    <span className="text-help text-muted-foreground">{t("portalAccess.needsEmail")}</span>
                  )}
                  {access.canDeactivate && access.account && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={deactivate.isPending}
                      onClick={() => setConfirming(access.account)}
                    >
                      <UserX aria-hidden="true" />
                      {t("portalAccess.deactivate")}
                    </Button>
                  )}
                  {sentTo === contact.id && invite.isSuccess && (
                    <span role="status" className="text-help text-success">
                      {t("portalAccess.sent", { email: contact.email })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirming !== null}
        title={t("portalAccess.deactivateTitle", { name: confirming?.contact_name ?? "" })}
        body={t("portalAccess.deactivateBody")}
        confirmLabel={t("portalAccess.deactivate")}
        onConfirm={() => {
          if (confirming) deactivate.mutate(confirming.id);
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
