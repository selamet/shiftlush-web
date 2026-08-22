import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QrCode } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ApiError } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

/**
 * The only decorative element in the product: the logo mark blown up to screen
 * scale. Horizontal lines are floor levels, the two verticals are guide rails,
 * the solid block is the car. It is the grid itself, not an illustration.
 */
function ShaftGraphic() {
  return (
    <svg
      viewBox="0 0 220 300"
      className="h-full w-full text-primary/25"
      fill="none"
      aria-hidden="true"
    >
      {[40, 80, 120, 160, 200, 240].map((y) => (
        <line key={y} x1="10" y1={y} x2="210" y2={y} stroke="currentColor" strokeWidth="1.5" />
      ))}
      <line x1="72" y1="10" x2="72" y2="290" stroke="currentColor" strokeWidth="2" />
      <line x1="148" y1="10" x2="148" y2="290" stroke="currentColor" strokeWidth="2" />
      <rect x="72" y="120" width="76" height="80" rx="3" className="fill-primary/70" />
    </svg>
  );
}

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
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      {/* Brand panel is always dark: it is the one surface where the product
          gets to have presence, and it reads the same in either theme. */}
      <div className="dark relative hidden flex-col justify-between overflow-hidden bg-background p-12 lg:flex">
        <div className="flex items-center gap-2.5 text-foreground">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect
              x="3.6"
              y="2.6"
              width="24.8"
              height="26.8"
              rx="4.2"
              stroke="currentColor"
              strokeWidth="2.6"
              className="text-primary"
            />
            <rect x="9" y="6.6" width="14" height="10.4" rx="1.6" className="fill-primary" />
            <path
              d="M9.4 21.6h13.2M9.4 25.4h13.2"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              className="text-primary"
            />
          </svg>
          <span className="text-cardtitle font-bold tracking-tight">ShiftLush</span>
        </div>

        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-70">
          <ShaftGraphic />
        </div>

        <div className="relative flex max-w-sm flex-col gap-3 text-foreground">
          <p className="text-section">{t("login.tagline")}</p>
          <p className="flex items-start gap-2 text-body text-muted-foreground">
            <QrCode className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("login.qrHint")}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-card px-6 py-12">
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
      </div>
    </div>
  );
}
