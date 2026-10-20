import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  notificationKeys,
  notificationPreferencesQuery,
  updateNotificationPreferences,
  type NotificationPreference,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { ListError } from "@/components/list/ListStates";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Which notifications also arrive by e-mail.
 *
 * Every notification is in the app regardless; the only choice is the e-mail.
 * One checkbox per kind, listed in the order the server sends them and named
 * with the kind's label — a kind the server adds before this client ships its
 * label still gets a row, under its raw code, rather than a preference nobody
 * can change.
 *
 * The form is mounted once the preferences have arrived, so each box starts
 * from the stored value rather than from an unchecked default that would read
 * as "off" for a moment and could be saved as such.
 */
export function NotificationPreferencesForm() {
  const { t } = useTranslation();
  const query = useQuery(notificationPreferencesQuery());

  if (query.isPending) return <p className="text-help text-subtle">{t("common.loading")}</p>;
  if (query.isError || !query.data) {
    return (
      <ListError
        message={errorMessage(query.error, t)}
        reference={supportReference(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <PreferencesForm initial={query.data} />;
}

function PreferencesForm({ initial }: { initial: NotificationPreference[] }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);

  const { submit, state } = useSubmit<NotificationPreference[], NotificationPreference[]>({
    mutationFn: updateNotificationPreferences,
    invalidate: [notificationKeys.preferences],
    onSuccess: () => setSaved(true),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onChange={() => setSaved(false)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        // The whole list, every kind: the PUT replaces every flag, so a kind
        // left out would be a kind silently reset to the server's default.
        submit(initial.map(({ kind }) => ({ kind, email: form.has(`email-${kind}`) })));
      }}
    >
      <p className="text-help text-muted-foreground">{t("notification.preferences.hint")}</p>

      {state.message && (
        <Alert tone="error" block title={state.message}>
          {state.reference && (
            <p className="text-help">
              {t("errors.requestIdLabel")}: <span className="font-mono">{state.reference}</span>
            </p>
          )}
        </Alert>
      )}

      <ul className="flex flex-col divide-y divide-border-subtle rounded-md border border-border-subtle">
        {initial.map(({ kind, email }) => (
          <li key={kind} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <span id={`pref-${kind}`} className="text-body">
              {enumLabel("notification.kind", kind)}
            </span>
            <label className="flex min-h-control-md cursor-pointer items-center gap-2 text-body text-muted-foreground">
              <input
                type="checkbox"
                name={`email-${kind}`}
                defaultChecked={email}
                aria-describedby={`pref-${kind}`}
                className="size-4 accent-primary focus-ring"
              />
              {t("notification.preferences.email")}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={state.pending}>
          {state.pending ? t("common.saving") : t("common.save")}
        </Button>
        {saved && (
          <span role="status" className="text-help text-success">
            {t("notification.preferences.saved")}
          </span>
        )}
      </div>
    </form>
  );
}
