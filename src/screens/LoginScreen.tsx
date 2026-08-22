import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PublicShell } from "@/screens/PublicShell";
import { ApiError } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

type LoginState = "idle" | "submitting" | "invalid" | "locked" | "failed";

export function LoginScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [state, setState] = useState<LoginState>("idle");
  const [failure, setFailure] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("submitting");

    try {
      await signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      void navigate({ to: "/elevators" });
    } catch (error) {
      // The lockout is its own state, not a worse version of a wrong password:
      // it is the system protecting the account, and the way out is different.
      if (error instanceof ApiError && error.code === "ACCOUNT_LOCKED") {
        setState("locked");
        return;
      }
      if (error instanceof ApiError && error.code === "INVALID_CREDENTIALS") {
        setState("invalid");
        return;
      }
      // Anything else — the server is down, the account is inactive — gets its
      // own message rather than being reported as a wrong password, which
      // would send the user to reset a password that was never the problem.
      setFailure(errorMessage(error, t));
      setState("failed");
    }
  }

  return (
    <PublicShell>
        <form
          className="flex w-full max-w-sm flex-col gap-5"
          onSubmit={submit}
        >
          <h1 className="text-title">{t("login.heading")}</h1>

          {state === "invalid" && <Alert tone="error" block title={t("login.invalidCredentials")} />}

          {state === "failed" && <Alert tone="error" block title={failure} />}

          {/* A lockout is the system protecting the account, not the user making
              a mistake — so it is warning-toned, and the way out (password
              reset) sits inside the same block rather than somewhere else. */}
          {state === "locked" && (
            <Alert tone="warning" block title={t("login.lockedTitle")}>
              <p className="text-help">{t("login.lockedBody", { minutes: 15 })}</p>
              <a href="/password-reset" className="mt-1 inline-block text-help underline">
                {t("auth.resetPassword")}
              </a>
            </Alert>
          )}

          <Field label={t("user.fields.email")} htmlFor="login-email" required>
            <Input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="h-control-lg"
              invalid={state === "invalid"}
            />
          </Field>

          <Field label={t("auth.password")} htmlFor="login-password" required>
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-control-lg"
              invalid={state === "invalid"}
            />
          </Field>

          {/* Stated before the user can trip it. Springing the lockout as a
              surprise generates more support calls than the lockout itself. */}
          <p className="text-help text-muted-foreground">{t("login.lockoutNotice")}</p>

          <Button type="submit" size="lg" disabled={state === "locked" || state === "submitting"}>
            {state === "submitting" ? t("auth.loggingIn") : t("auth.login")}
          </Button>

          <div className="flex items-center justify-between text-help">
            <a href="/register" className="text-primary hover:underline">
              {t("auth.register")}
            </a>
            <a href="/password-reset" className="text-muted-foreground hover:underline">
              {t("auth.forgotPassword")}
            </a>
          </div>
        </form>
    </PublicShell>
  );
}
