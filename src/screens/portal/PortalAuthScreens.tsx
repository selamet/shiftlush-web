import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { errorMessage } from "@/api/errors";
import { portalAccept, portalConfirmPasswordReset, portalRequestPasswordReset } from "@/api/portal-queries";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { usePortalSession } from "@/lib/portal-session";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PortalPublicFrame } from "./PortalLayout";

function field(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? "");
}

/**
 * Signing in to the portal.
 *
 * Its own form and its own session: a member of the firm who is signed in to
 * the app and opens /portal lands here too, because the portal does not know
 * them — it knows building managers, by their portal account.
 */
export function PortalLoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn } = usePortalSession();
  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => signIn(email, password),
    onSuccess: () => void navigate({ to: "/portal" }),
  });

  return (
    <PortalPublicFrame title={t("portal.login.title")}>
      <p className="text-body text-muted-foreground">{t("portal.login.intro")}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate({
            email: field(event.currentTarget, "email").trim(),
            password: field(event.currentTarget, "password"),
          });
        }}
      >
        {login.isError && <Alert tone="error" block title={errorMessage(login.error, t)} />}
        <Field label={t("portal.fields.email")} htmlFor="portal-email" required>
          <Input name="email" type="email" required autoComplete="username" className="h-control-lg" />
        </Field>
        <Field label={t("portal.fields.password")} htmlFor="portal-password" required>
          <Input name="password" type="password" required autoComplete="current-password" className="h-control-lg" />
        </Field>
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending ? t("common.sending") : t("portal.login.submit")}
        </Button>
        <Link to="/portal/password-reset" className="self-start text-body text-primary hover:underline">
          {t("portal.login.forgot")}
        </Link>
      </form>
    </PortalPublicFrame>
  );
}

/**
 * Accepting an invitation: choosing a password, which signs the person in.
 * The answer is the same token pair sign-in returns, taken up straight away.
 */
export function PortalAcceptScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ strict: false }) as { token?: string };
  const { adoptTokens } = usePortalSession();
  const accept = useMutation({
    mutationFn: (password: string) => portalAccept(token ?? "", password),
    onSuccess: (tokens) => {
      adoptTokens(tokens);
      void navigate({ to: "/portal" });
    },
  });

  return (
    <PortalPublicFrame title={t("portal.accept.title")}>
      <p className="text-body text-muted-foreground">{t("portal.accept.intro")}</p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          accept.mutate(field(event.currentTarget, "password"));
        }}
      >
        {accept.isError && <Alert tone="error" block title={errorMessage(accept.error, t)} />}
        <Field
          label={t("portal.fields.newPassword")}
          htmlFor="portal-new-password"
          required
          hint={t("portal.passwordHint", { count: MIN_PASSWORD_LENGTH })}
        >
          <Input
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="h-control-lg"
          />
        </Field>
        <Button type="submit" size="lg" disabled={accept.isPending}>
          {accept.isPending ? t("common.sending") : t("portal.accept.submit")}
        </Button>
      </form>
    </PortalPublicFrame>
  );
}

/**
 * Asking for a reset link. The answer is the same whether or not the address
 * has an account, so the page says "if it exists" — the server will not say
 * which addresses are customers, and neither does this.
 */
export function PortalPasswordResetScreen() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const request = useMutation({
    mutationFn: portalRequestPasswordReset,
    onSuccess: () => setSent(true),
  });

  return (
    <PortalPublicFrame title={t("portal.reset.title")}>
      {sent ? (
        <Alert tone="success" block title={t("portal.reset.sent")} />
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            request.mutate(field(event.currentTarget, "email").trim());
          }}
        >
          <p className="text-body text-muted-foreground">{t("portal.reset.intro")}</p>
          {request.isError && <Alert tone="error" block title={errorMessage(request.error, t)} />}
          <Field label={t("portal.fields.email")} htmlFor="portal-reset-email" required>
            <Input name="email" type="email" required autoComplete="email" className="h-control-lg" />
          </Field>
          <Button type="submit" size="lg" disabled={request.isPending}>
            {request.isPending ? t("common.sending") : t("portal.reset.submit")}
          </Button>
        </form>
      )}
      <Link to="/portal/login" className="self-start text-body text-primary hover:underline">
        {t("portal.backToLogin")}
      </Link>
    </PortalPublicFrame>
  );
}

export function PortalPasswordResetConfirmScreen() {
  const { t } = useTranslation();
  const { token } = useParams({ strict: false }) as { token?: string };
  const confirm = useMutation({
    mutationFn: (password: string) => portalConfirmPasswordReset(token ?? "", password),
  });

  return (
    <PortalPublicFrame title={t("portal.reset.confirmTitle")}>
      {confirm.isSuccess ? (
        <Alert tone="success" block title={t("portal.reset.done")} />
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            confirm.mutate(field(event.currentTarget, "password"));
          }}
        >
          {confirm.isError && <Alert tone="error" block title={errorMessage(confirm.error, t)} />}
          <Field
            label={t("portal.fields.newPassword")}
            htmlFor="portal-reset-password"
            required
            hint={t("portal.passwordHint", { count: MIN_PASSWORD_LENGTH })}
          >
            <Input
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="h-control-lg"
            />
          </Field>
          <Button type="submit" size="lg" disabled={confirm.isPending}>
            {confirm.isPending ? t("common.saving") : t("portal.reset.confirmSubmit")}
          </Button>
        </form>
      )}
      <Link to="/portal/login" className="self-start text-body text-primary hover:underline">
        {t("portal.backToLogin")}
      </Link>
    </PortalPublicFrame>
  );
}
