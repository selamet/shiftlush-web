import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, MailWarning } from "lucide-react";
import {
  acceptInvitation,
  invitationPreviewQuery,
  verifyEmail,
  type TokenResponse,
} from "@/api/queries";
import { setAccessToken } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { formValues, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { PublicShell } from "@/screens/PublicShell";
import { useEffect, useState } from "react";

const MIN_PASSWORD_LENGTH = 10;

/**
 * Accepting an invitation.
 *
 * The invitee chooses their own password here, and that is the whole point of
 * the flow: an administrator who could set it could read it. The screen shows
 * who invited them and as what, because a link from an unfamiliar address
 * asking for a password is indistinguishable from a phishing attempt unless it
 * can say something only the real sender would know.
 */
export function InvitationScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ strict: false }) as { token?: string };

  const preview = useQuery({
    ...invitationPreviewQuery(token ?? ""),
    enabled: Boolean(token),
  });

  const { submit, state } = useSubmit<Record<string, string>, TokenResponse>({
    mutationFn: ({ password }) => acceptInvitation(token ?? "", password),
    onSuccess: (tokens) => {
      setAccessToken(tokens.access);
      void navigate({ to: "/elevators" });
    },
  });

  if (preview.isPending) {
    return (
      <PublicShell>
        <div className="h-6 w-64 animate-pulse rounded-xs bg-muted" />
      </PublicShell>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <PublicShell>
        <div className="flex w-full max-w-sm flex-col gap-4">
          <MailWarning className="size-8 text-warning" aria-hidden="true" />
          <h1 className="text-title">{t("auth.invitationInvalidHeading")}</h1>
          {/* Expired and revoked are different codes and produce different
              sentences: one means ask for another, the other means the
              invitation was withdrawn. */}
          <p className="text-body text-muted-foreground">{errorMessage(preview.error, t)}</p>
          <Link to="/login" className="text-body text-primary hover:underline">
            {t("auth.backToLogin")}
          </Link>
        </div>
      </PublicShell>
    );
  }

  const invitation = preview.data;

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
          <h1 className="text-title">{t("auth.invitationHeading")}</h1>
          <p className="text-body text-muted-foreground">
            {t("auth.invitationSubtitle", {
              company: invitation.company_name,
              role: enumLabel("user.role", invitation.role),
            })}
          </p>
        </div>

        <div className="rounded-md border border-border-subtle bg-muted px-3 py-2.5 text-body">
          <span className="text-muted-foreground">{t("user.fields.email")}: </span>
          {invitation.email}
        </div>

        {state.message && <Alert tone="error" block title={state.message} />}

        <Field
          label={t("auth.choosePassword")}
          htmlFor="inv-password"
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

        <Button type="submit" size="lg" disabled={state.pending}>
          {state.pending ? t("common.saving") : t("auth.acceptInvitation")}
        </Button>
      </form>
    </PublicShell>
  );
}

/**
 * Confirming an address from the link in the verification message.
 *
 * Runs on arrival: the user already expressed their intent by clicking the
 * link, and a page that asks them to click a second button to do what they
 * came for is asking them to confirm they meant it.
 */
export function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { token } = useParams({ strict: false }) as { token?: string };
  const [status, setStatus] = useState<"working" | "done" | "failed">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        await verifyEmail(token);
        if (!cancelled) setStatus("done");
      } catch (error) {
        if (cancelled) return;
        setMessage(errorMessage(error, t));
        setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  return (
    <PublicShell>
      <div className="flex w-full max-w-sm flex-col gap-4">
        {status === "working" && (
          <p className="text-body text-muted-foreground">{t("common.loading")}…</p>
        )}
        {status === "done" && (
          <>
            <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
            <h1 className="text-title">{t("auth.verifiedHeading")}</h1>
            <p className="text-body text-muted-foreground">{t("auth.verifiedBody")}</p>
            <Link to="/login" className="text-body text-primary hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </>
        )}
        {status === "failed" && (
          <>
            <MailWarning className="size-8 text-warning" aria-hidden="true" />
            <h1 className="text-title">{t("auth.verifyFailedHeading")}</h1>
            <p className="text-body text-muted-foreground">{message}</p>
            {/* The way out is inside the application: resending needs a session,
                because it sends to the address of whoever is signed in. */}
            <p className="text-help text-muted-foreground">{t("auth.verifyFailedHint")}</p>
            <Link to="/login" className="text-body text-primary hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </>
        )}
      </div>
    </PublicShell>
  );
}
