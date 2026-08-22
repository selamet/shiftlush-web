import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  invitationKeys,
  inviteUser,
  type Invitation,
  type InvitationCreate,
  type UserRole,
} from "@/api/queries";
import { formValues, useIdempotencyKey, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/**
 * The roles an invitation may carry.
 *
 * `owner` is absent because the server refuses it: an invitation that could
 * mint an owner would let an administrator promote themselves past the one role
 * they do not hold. Offering the option would mean offering a choice that can
 * only ever come back as a validation error.
 */
const INVITABLE_ROLES: UserRole[] = ["admin", "operations", "technician", "accountant"];

/**
 * Inviting a colleague.
 *
 * The administrator never sets a password and never sees one. They name a
 * person and a role; the server mints a token, mails it, and the invitee
 * chooses their own password when they arrive. Anything else would be both a
 * security hole and a data-protection problem — see specification 7.2.
 */
export function InviteUserScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { emailVerified } = useSession();
  const idempotencyKey = useIdempotencyKey();

  const { submit, state } = useSubmit<InvitationCreate, Invitation>({
    mutationFn: (body) => inviteUser(body, idempotencyKey),
    invalidate: [invitationKeys.all],
    onSuccess: () => void navigate({ to: "/users" }),
  });

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/users" className="hover:underline">
            {t("user.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{t("user.actions.invite")}</span>
        </nav>
        <h1 className="text-title">{t("user.inviteHeading")}</h1>
        <p className="text-body text-muted-foreground">{t("user.inviteSubtitle")}</p>
      </div>

      {/* Stated before the attempt rather than after it. The server refuses to
          send mail from an unverified account, and a form that submits into a
          guaranteed refusal wastes the round trip and reads as a fault. */}
      {!emailVerified && (
        <Alert tone="warning" block title={t("user.inviteBlockedHeading")}>
          <p className="text-help">{t("user.inviteBlockedBody")}</p>
        </Alert>
      )}

      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit(formValues(event.currentTarget) as unknown as InvitationCreate);
        }}
      >
        {state.message && (
          <Alert tone="error" block title={state.message}>
            {state.reference && (
              <p className="text-help">
                {t("errors.requestIdLabel")}:{" "}
                <span className="font-mono">{state.reference}</span>
              </p>
            )}
          </Alert>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("user.fields.firstName")}
            htmlFor="iu-first-name"
            required
            error={state.fields.first_name}
          >
            <Input
              name="first_name"
              required
              maxLength={60}
              autoComplete="off"
              invalid={Boolean(state.fields.first_name)}
            />
          </Field>

          <Field
            label={t("user.fields.lastName")}
            htmlFor="iu-last-name"
            required
            error={state.fields.last_name}
          >
            <Input
              name="last_name"
              required
              maxLength={60}
              autoComplete="off"
              invalid={Boolean(state.fields.last_name)}
            />
          </Field>
        </div>

        <Field
          label={t("user.fields.email")}
          htmlFor="iu-email"
          required
          // An address that already has an account is refused with its own code
          // rather than a vague one, because the reason is specific: a person
          // can belong to one firm, so the answer is a different address.
          hint={t("user.inviteEmailHint")}
          error={state.fields.email}
        >
          <Input
            name="email"
            type="email"
            required
            maxLength={150}
            autoComplete="off"
            invalid={Boolean(state.fields.email)}
          />
        </Field>

        <Field
          label={t("user.fields.role")}
          htmlFor="iu-role"
          required
          hint={t("user.ownerNotInvitable")}
          error={state.fields.role}
        >
          <select
            id="iu-role"
            name="role"
            required
            defaultValue="operations"
            className="h-control-md rounded-md border border-input bg-card px-3 text-body focus-ring pointer-coarse:h-control-lg"
          >
            {INVITABLE_ROLES.map((value) => (
              <option key={value} value={value}>
                {enumLabel("user.role", value)}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={state.pending || !emailVerified}>
            {state.pending ? t("common.sending") : t("user.inviteSubmit")}
          </Button>
          <Link to="/users" className="text-body text-muted-foreground hover:underline">
            {t("common.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
