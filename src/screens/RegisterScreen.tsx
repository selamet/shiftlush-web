import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { registerCompany, type TokenResponse } from "@/api/queries";
import { setAccessToken } from "@/api/client";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PublicShell } from "@/screens/PublicShell";

/**
 * Opening a firm's account.
 *
 * Creates the company and its first owner in one call, and signs them in. The
 * address is not verified yet and does not need to be to start working — the
 * only thing it gates is inviting colleagues, and the shell says so.
 */
export function RegisterScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const idempotencyKey = useIdempotencyKey();

  const { submit, state } = useSubmit<Record<string, string>, TokenResponse>({
    mutationFn: (body) => registerCompany(body as never, idempotencyKey),
    onSuccess: (tokens) => {
      // Straight in. Asking somebody to sign in again with credentials they
      // typed thirty seconds ago is a step that exists only for the system's
      // convenience.
      setAccessToken(tokens.access);
      void navigate({ to: "/elevators" });
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
        <div className="flex flex-col gap-1">
          <h1 className="text-title">{t("auth.registerHeading")}</h1>
          <p className="text-body text-muted-foreground">{t("auth.registerSubtitle")}</p>
        </div>

        {state.message && <Alert tone="error" block title={state.message} />}

        <Field
          label={t("company.fields.legalName")}
          htmlFor="rf-legal-name"
          required
          hint={t("auth.legalNameHint")}
          error={state.fields.legal_name}
        >
          <Input name="legal_name" required maxLength={200} autoComplete="organization" />
        </Field>

        <Field
          label={t("company.fields.displayName")}
          htmlFor="rf-display-name"
          required
          error={state.fields.display_name}
        >
          <Input name="display_name" required maxLength={80} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("user.fields.firstName")}
            htmlFor="rf-first-name"
            required
            error={state.fields.first_name}
          >
            <Input name="first_name" required maxLength={60} autoComplete="given-name" />
          </Field>
          <Field
            label={t("user.fields.lastName")}
            htmlFor="rf-last-name"
            required
            error={state.fields.last_name}
          >
            <Input name="last_name" required maxLength={60} autoComplete="family-name" />
          </Field>
        </div>

        <Field
          label={t("user.fields.email")}
          htmlFor="rf-email"
          required
          error={state.fields.email}
        >
          <Input name="email" type="email" required autoComplete="email" />
        </Field>

        <Field
          label={t("auth.password")}
          htmlFor="rf-password"
          required
          hint={t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}
          error={state.fields.password}
        >
          {/* minLength only. The full policy — a common-password blocklist, a
              similarity check against the user's own name — lives on the server
              and cannot be reproduced here without becoming a second copy. */}
          <Input
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
          />
        </Field>

        <Button type="submit" size="lg" disabled={state.pending}>
          {state.pending ? t("auth.registering") : t("auth.register")}
        </Button>

        <p className="text-help text-muted-foreground">
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="text-primary hover:underline">
            {t("auth.login")}
          </Link>
        </p>
      </form>
    </PublicShell>
  );
}
