import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { confirmPasswordReset, requestPasswordReset } from "@/api/queries";
import { formValues, useSubmit } from "@/lib/form";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PublicShell } from "@/screens/PublicShell";

/**
 * Asking for a reset link.
 *
 * The confirmation is identical whether or not the address is registered, and
 * that is the entire design of this screen. A form that says "no such account"
 * is a form that tells anyone who asks which addresses have accounts here — and
 * the server already answers the same way for both, so a client that
 * distinguished them would be inventing information it was not given.
 */
export function PasswordResetRequestScreen() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);

  const { submit, state } = useSubmit<Record<string, string>, void>({
    mutationFn: ({ email }) => requestPasswordReset(email),
    onSuccess: () => setSent(true),
  });

  return (
    <PublicShell>
      {sent ? (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <MailCheck className="size-8 text-primary" aria-hidden="true" />
          <h1 className="text-title">{t("auth.resetSentHeading")}</h1>
          <p className="text-body text-muted-foreground">{t("auth.resetSentBody")}</p>
          <Link to="/login" className="text-body text-primary hover:underline">
            {t("auth.backToLogin")}
          </Link>
        </div>
      ) : (
        <form
          className="flex w-full max-w-sm flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit(formValues(event.currentTarget));
          }}
        >
          <div className="flex flex-col gap-1">
            <h1 className="text-title">{t("auth.resetHeading")}</h1>
            <p className="text-body text-muted-foreground">{t("auth.resetSubtitle")}</p>
          </div>

          {state.message && <Alert tone="error" block title={state.message} />}

          <Field
            label={t("user.fields.email")}
            htmlFor="pr-email"
            required
            error={state.fields.email}
          >
            <Input name="email" type="email" required autoComplete="email" />
          </Field>

          <Button type="submit" size="lg" disabled={state.pending}>
            {state.pending ? t("common.sending") : t("auth.sendResetLink")}
          </Button>

          <Link to="/login" className="text-help text-muted-foreground hover:underline">
            {t("auth.backToLogin")}
          </Link>
        </form>
      )}
    </PublicShell>
  );
}

/**
 * Setting a new password from the link in the message.
 *
 * The token is single-use and the server revokes every session on success, so
 * anyone who took the account over is signed out along with the owner. That is
 * why this screen sends the user back to sign in rather than logging them in.
 */
export function PasswordResetConfirmScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ strict: false }) as { token?: string };
  const [done, setDone] = useState(false);

  const { submit, state } = useSubmit<Record<string, string>, void>({
    mutationFn: ({ password }) => confirmPasswordReset(token ?? "", password),
    onSuccess: () => {
      setDone(true);
      void navigate({ to: "/login" });
    },
  });

  return (
    <PublicShell>
      <form
        className="flex w-full max-w-sm flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit(formValues(event.currentTarget));
        }}
      >
        <h1 className="text-title">{t("auth.newPasswordHeading")}</h1>

        {/* A dead link is the common case here, not an edge one: these expire
            in an hour and are used once. Saying which of the two happened is
            what lets the user decide whether to ask for a new one. */}
        {state.message && <Alert tone="error" block title={state.message} />}

        <Field
          label={t("auth.newPassword")}
          htmlFor="pc-password"
          required
          hint={t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}
          error={state.fields.password}
        >
          <Input
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" size="lg" disabled={state.pending || done}>
          {state.pending ? t("common.saving") : t("auth.setPassword")}
        </Button>

        <Link to="/password-reset" className="text-help text-muted-foreground hover:underline">
          {t("auth.requestNewLink")}
        </Link>
      </form>
    </PublicShell>
  );
}
