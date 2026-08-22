import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { changePassword, sessionKeys, type TokenResponse } from "@/api/queries";
import { useSubmit } from "@/lib/form";
import { useSession } from "@/lib/session";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

interface Wanted {
  current: string;
  next: string;
}

/**
 * Changing the password without leaving the product.
 *
 * The screen used to offer a reset link instead, and said so honestly: there
 * was no authenticated password-change endpoint to put behind a form. There is
 * one now, and it is better than the link in every way that matters — it proves
 * the current password rather than possession of the mailbox, it applies the
 * same policy registration does, and it leaves this device signed in.
 *
 * The last of those is the part a client can get wrong. The response is the
 * same `TokenResponse` sign-in returns because the server has just ended every
 * session on the account and re-opened this one on fresh tokens. Dropping it
 * would mean the user is signed out by their own successful password change —
 * quietly, and minutes later, when the token they were still holding runs out.
 * `adoptTokens` is that response being taken up; see lib/session.
 */
export function ChangePasswordForm() {
  const { t } = useTranslation();
  const { adoptTokens } = useSession();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [changed, setChanged] = useState(false);

  const change = useSubmit<Wanted, TokenResponse>({
    mutationFn: ({ current, next }) => changePassword(current, next),
    // The server answers a wrong current password with a top-level
    // INVALID_CREDENTIALS and no field, which is correct of it and useless
    // above a form holding two password boxes. Routed to the one it can only
    // ever be about.
    fieldForCode: { INVALID_CREDENTIALS: "current_password" },
    onSuccess: (tokens) => {
      // First, and before anything else on this screen asks the server a
      // question: the tokens in hand were retired by the call that just
      // succeeded.
      adoptTokens(tokens);
      setChanged(true);
      // Two passwords are now in the DOM and neither is wanted there.
      formRef.current?.reset();
      // Every other session ended a moment ago. The list below this form is
      // the only evidence of that the user is given, so it is refetched
      // rather than left showing devices that are no longer signed in.
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
    },
  });

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setChanged(false);
        const data = new FormData(event.currentTarget);
        // Not trimmed. A leading or trailing space is a character of the
        // password, and quietly removing one is how a form refuses a password
        // that is correct.
        change.submit({
          current: String(data.get("current_password") ?? ""),
          next: String(data.get("new_password") ?? ""),
        });
      }}
    >
      <p className="text-body text-muted-foreground">{t("settings.passwordBody")}</p>

      {/* Only failures that belong to no field; the wrong-password case is
          shown against the box it refers to. */}
      {change.state.message && <Alert tone="error" block title={change.state.message} />}
      {changed && <Alert tone="success" block title={t("settings.passwordChanged")} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("auth.currentPassword")}
          htmlFor="pw-current"
          required
          error={change.state.fields.current_password}
        >
          <Input
            name="current_password"
            type="password"
            required
            autoComplete="current-password"
            invalid={Boolean(change.state.fields.current_password)}
          />
        </Field>

        <Field
          label={t("auth.newPassword")}
          htmlFor="pw-new"
          required
          hint={t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}
          error={change.state.fields.new_password}
        >
          <Input
            name="new_password"
            type="password"
            required
            // The one rule worth spending on the client: it saves a round trip
            // on an obviously short password. The blocklist and the similarity
            // check are the server's, and cannot be evaluated here.
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            invalid={Boolean(change.state.fields.new_password)}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={change.state.pending}>
          {change.state.pending ? t("common.saving") : t("settings.changePassword")}
        </Button>
      </div>
    </form>
  );
}
