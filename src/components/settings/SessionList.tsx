import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { MonitorSmartphone } from "lucide-react";
import {
  revokeOtherSessions,
  revokeSession,
  sessionKeys,
  sessionListQuery,
  type AuthSession,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { useSubmit } from "@/lib/form";
import { formatDateTime } from "@/lib/format";
import { deviceLabel } from "@/lib/user-agent";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ListError } from "@/components/list/ListStates";

/**
 * The devices signed in to this account.
 *
 * Three deliberate absences, and each one is a decision rather than an
 * oversight:
 *
 * The IP address is on the record and is not shown. It is the one field here
 * that is about *where a person has been* rather than which device they are
 * holding, it is no help at all in recognising a laptop, and printing a month
 * of somebody's movements down the side of a settings page is not a thing this
 * screen needs to do to answer the question it exists for.
 *
 * The raw user-agent string is not shown either — see lib/user-agent for why a
 * parsed "Chrome · macOS" is both more useful and less of a fingerprint.
 *
 * The expiry is not shown. Every session has one, none of them helps anyone
 * tell one row from another, and a date that means "this will stop working by
 * itself eventually" reads as a warning about something that is not happening.
 *
 * What is left is what the row is for: which device, when it signed in, when it
 * was last used, and whether it is this one.
 *
 * There is no version of this list for anybody else. The endpoint takes no user
 * id and is scoped to the caller by the token, so nothing here can be pointed
 * at a colleague — which is why the copy above it says so plainly rather than
 * leaving a reader to wonder whose sessions an administrator can see.
 */
export function SessionList() {
  const { t } = useTranslation();
  const sessions = useQuery(sessionListQuery());

  /** Which row is being ended, so the pending state lands on its own button. */
  const [endingId, setEndingId] = useState<string | null>(null);
  const [ended, setEnded] = useState<"one" | "others" | null>(null);

  const end = useSubmit<string, void>({
    mutationFn: (id) => revokeSession(id),
    invalidate: [sessionKeys.all],
    onSuccess: () => {
      setEndingId(null);
      setEnded("one");
    },
  });

  const endOthers = useSubmit<void, void>({
    mutationFn: () => revokeOtherSessions(),
    invalidate: [sessionKeys.all],
    onSuccess: () => setEnded("others"),
  });

  if (sessions.isPending) {
    return (
      <div
        className="flex flex-col gap-2"
        role="status"
        aria-label={t("common.loading")}
      >
        {[0, 1].map((row) => (
          <div key={row} className="h-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  if (sessions.isError || !sessions.data) {
    return (
      <ListError
        message={errorMessage(sessions.error, t)}
        reference={supportReference(sessions.error)}
        onRetry={() => void sessions.refetch()}
      />
    );
  }

  // This device first, then most recently used. Someone scanning for the row
  // they are about to end should not have to find their own first to rule it
  // out — it is at the top, marked, and carries no control.
  const rows = [...sessions.data].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    return b.last_used_at.localeCompare(a.last_used_at);
  });
  const others = rows.filter((row) => !row.is_current);

  // "End the others" keeps the session the request arrives on, and the server
  // works out which one that is from the refresh cookie — not from the access
  // token, which says who is calling and never which of their devices. On a
  // request that carries no usable cookie there is no session to keep and the
  // endpoint ends every one of them, this device included. That is the single
  // case where the promise made below would be false, so the control is offered
  // only when the list can point at the row that is going to survive.
  const thisDevice = rows.some((row) => row.is_current);

  const failure = end.state.message || endOthers.state.message;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-muted-foreground">{t("settings.sessionsBody")}</p>

      {failure && <Alert tone="error" block title={failure} />}
      {/* Both keys spelled out at a call site rather than chosen inside t():
          scripts/check-i18n-keys.mjs reads literals, and a key it cannot see is
          one it reports as unused. */}
      {ended === "one" && !failure && (
        <Alert tone="success" block title={t("settings.sessionEnded")} />
      )}
      {ended === "others" && !failure && (
        <Alert tone="success" block title={t("settings.otherSessionsEnded")} />
      )}

      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground">{t("settings.sessionsEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <SessionRow
              key={row.id}
              session={row}
              pending={endingId === row.id && end.state.pending}
              onEnd={() => {
                setEnded(null);
                setEndingId(row.id);
                end.submit(row.id);
              }}
            />
          ))}
        </ul>
      )}

      {/* Nothing to act on when there is nothing listed; a disabled control
          under "no open sessions" explains itself twice and helps neither. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {/* No confirmation, and no warning about being signed out. The server
              keeps the session this request arrives on, by design and by name —
              "revoke others" is the endpoint. Warning about a consequence that
              will not happen is how a control stops being pressed by the people
              who most need it. */}
          <span className="mr-auto text-help text-muted-foreground">
            {!thisDevice
              ? t("settings.sessionsCurrentUnknown")
              : others.length === 0
                ? t("settings.sessionsOnlyThisDevice")
                : ""}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!thisDevice || others.length === 0 || endOthers.state.pending}
            onClick={() => {
              setEnded(null);
              endOthers.submit();
            }}
          >
            {endOthers.state.pending ? t("common.saving") : t("settings.signOutOthers")}
          </Button>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  pending,
  onEnd,
}: {
  session: AuthSession;
  pending: boolean;
  onEnd: () => void;
}) {
  const { t } = useTranslation();
  const device = deviceLabel(session.user_agent);

  return (
    <li className="flex items-center gap-3 rounded-md border border-border-subtle bg-card px-3 py-2.5">
      <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-label text-foreground">
            {device ?? t("settings.sessionUnknownDevice")}
          </span>
          {session.is_current && (
            <span className="rounded-sm bg-primary-soft px-1.5 py-0.5 text-help font-medium text-primary">
              {t("settings.sessionCurrent")}
            </span>
          )}
        </span>
        <span className="text-help text-muted-foreground">
          {t("settings.sessionSignedIn", { when: formatDateTime(session.signed_in_at) })}
          {" · "}
          {t("settings.sessionLastSeen", { when: formatDateTime(session.last_used_at) })}
        </span>
      </div>

      {/* The current session gets no control. Revoking it is something the
          endpoint allows and this list must not offer: a row that says "this
          device" next to a button that ends it is a sign-out button wearing
          somebody else's label, and the way out of the product already exists
          in the user menu. */}
      {!session.is_current && (
        <Button variant="ghost" size="sm" className="ml-auto" disabled={pending} onClick={onEnd}>
          {pending ? t("common.saving") : t("settings.endSession")}
        </Button>
      )}
    </li>
  );
}
