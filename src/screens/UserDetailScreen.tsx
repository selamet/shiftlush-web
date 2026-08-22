import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  activeOwnerCountQuery,
  deactivateUser,
  updateUser,
  userKeys,
  userQuery,
  type TeamUser,
  type UserRole,
  type UserWrite,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { formValues, useSubmit } from "@/lib/form";
import { enumLabel } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { RoleChip, StatusChip } from "@/components/ui/status-chip";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";
import { AssignedCustomers } from "@/components/users/AssignedCustomers";

const ROLES: UserRole[] = ["owner", "admin", "operations", "technician", "accountant"];

/**
 * One colleague: their record, their role, what they can see, and the end of
 * their access.
 *
 * Two of the controls here can lock a company out of its own user management,
 * and the server refuses both — `LAST_OWNER_CANNOT_BE_DEACTIVATED` guards the
 * last active owner against deactivation *and* against a change of role, and
 * `CANNOT_DEACTIVATE_SELF` catches the administrator ending the session they
 * are working in. This screen states those reasons in place of the control
 * rather than letting somebody press it and read a refusal.
 */
export function UserDetailScreen() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id?: string };
  const { userId } = useSession();

  const user = useQuery(userQuery(id ?? ""));
  const owners = useQuery(activeOwnerCountQuery());

  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState(false);

  const details = useSubmit<UserWrite, TeamUser>({
    mutationFn: (body) => updateUser(id as string, body),
    invalidate: [userKeys.all],
    onSuccess: () => setSaved(true),
  });

  const deactivate = useSubmit<string, TeamUser>({
    mutationFn: (target) => deactivateUser(target),
    invalidate: [userKeys.all],
    onSuccess: () => setConfirming(false),
  });

  if (user.isPending) return <DetailSkeleton />;
  if (user.isError || !user.data) {
    return (
      <ListError
        message={errorMessage(user.error, t)}
        reference={supportReference(user.error)}
        onRetry={() => void user.refetch()}
      />
    );
  }

  const record = user.data;
  const isSelf = record.id === userId;
  /**
   * Undefined until the count arrives, and treated as "one" while it is
   * missing. Withholding the control for a moment is cheaper than offering one
   * the server is about to refuse — and if the count could not be read at all,
   * the cautious answer is the right one.
   */
  const isLastOwner = record.role === "owner" && record.is_active && (owners.data?.pagination.total ?? 1) <= 1;

  const roleLocked = isSelf || isLastOwner;
  const roleLockReason = isSelf ? t("user.roleLockedSelf") : t("user.roleLockedLastOwner");
  const deactivateBlocked = isSelf
    ? t("user.deactivateSelf")
    : isLastOwner
      ? t("user.deactivateLastOwner")
      : "";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1.5">
        <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
          <Link to="/users" className="hover:underline">
            {t("user.title")}
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="text-foreground">{record.full_name}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title">{record.full_name}</h1>
          <RoleChip value={record.role} />
          {!record.is_active && (
            <StatusChip weight="recessed">{t("user.inactiveChip")}</StatusChip>
          )}
          {record.is_active && !record.is_email_verified && (
            <StatusChip weight="dashed">{t("user.unverified")}</StatusChip>
          )}
        </div>
        <p className="text-body text-muted-foreground">{record.email}</p>
      </div>

      <div className="flex max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("user.detailsHeading")}</CardTitle>
            {/* The address is the username and is globally unique; changing it
                silently would strand a password reset already in flight. The
                server keeps it out of this serializer for that reason. */}
            <CardDescription>{t("user.emailImmutable")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                setSaved(false);
                details.submit(formValues(event.currentTarget) as unknown as UserWrite);
              }}
            >
              {details.state.message && (
                <Alert tone="error" block title={details.state.message}>
                  {details.state.reference && (
                    <p className="text-help">
                      {t("errors.requestIdLabel")}:{" "}
                      <span className="font-mono">{details.state.reference}</span>
                    </p>
                  )}
                </Alert>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  label={t("user.fields.firstName")}
                  htmlFor="ud-first-name"
                  required
                  error={details.state.fields.first_name}
                >
                  <Input
                    name="first_name"
                    required
                    maxLength={60}
                    defaultValue={record.first_name}
                    invalid={Boolean(details.state.fields.first_name)}
                  />
                </Field>

                <Field
                  label={t("user.fields.lastName")}
                  htmlFor="ud-last-name"
                  required
                  error={details.state.fields.last_name}
                >
                  <Input
                    name="last_name"
                    required
                    maxLength={60}
                    defaultValue={record.last_name}
                    invalid={Boolean(details.state.fields.last_name)}
                  />
                </Field>

                <Field
                  label={t("user.fields.phone")}
                  htmlFor="ud-phone"
                  error={details.state.fields.phone}
                >
                  <Input
                    name="phone"
                    type="tel"
                    defaultValue={record.phone}
                    invalid={Boolean(details.state.fields.phone)}
                  />
                </Field>

                <Field
                  label={t("user.fields.role")}
                  htmlFor="ud-role"
                  // A disabled select is left out of the submitted form data,
                  // so a locked role is not merely greyed out — the field is
                  // absent from the PATCH and cannot be changed by a crafted
                  // click. The reason takes the place of the hint.
                  hint={roleLocked ? roleLockReason : undefined}
                  error={details.state.fields.role}
                >
                  <select
                    id="ud-role"
                    name="role"
                    disabled={roleLocked}
                    defaultValue={record.role}
                    className="h-control-md rounded-md border border-input bg-card px-3 text-body focus-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground pointer-coarse:h-control-lg"
                  >
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {enumLabel("user.role", value)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label={t("user.fields.certificateNumber")}
                  htmlFor="ud-certificate-number"
                  error={details.state.fields.certificate_number}
                >
                  <Input
                    name="certificate_number"
                    maxLength={50}
                    defaultValue={record.certificate_number}
                    invalid={Boolean(details.state.fields.certificate_number)}
                  />
                </Field>

                <Field
                  label={t("user.fields.certificateValidUntil")}
                  htmlFor="ud-certificate-valid-until"
                  error={details.state.fields.certificate_valid_until}
                >
                  <Input
                    name="certificate_valid_until"
                    type="date"
                    defaultValue={record.certificate_valid_until ?? undefined}
                    invalid={Boolean(details.state.fields.certificate_valid_until)}
                  />
                </Field>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={details.state.pending}>
                  {details.state.pending ? t("common.saving") : t("common.save")}
                </Button>
                {saved && (
                  <span className="text-help text-muted-foreground">{t("user.detailsSaved")}</span>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Keyed by the record's own id so moving between two colleagues does
            not carry one person's ticked boxes onto the other. */}
        {record.role === "technician" && <AssignedCustomers key={record.id} user={record} />}

        {record.is_active ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("user.deactivateHeading")}</CardTitle>
              <CardDescription>{t("user.deactivateBody")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {deactivateBlocked ? (
                <Alert tone="info" block title={deactivateBlocked} />
              ) : (
                <div>
                  <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
                    {t("user.actions.deactivate")}
                  </Button>
                </div>
              )}
              {deactivate.state.message && (
                <p className="text-help text-destructive">{deactivate.state.message}</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Alert tone="info" block title={t("user.inactiveNotice")}>
            <p className="text-help">{t("user.inactiveNoUndo")}</p>
          </Alert>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        weight="heavy"
        title={t("user.deactivateTitle", { name: record.full_name })}
        body={t("user.deactivateBody")}
        consequences={[
          t("user.deactivateEffectSessions"),
          t("user.deactivateEffectLogin"),
          t("user.deactivateEffectIrreversible"),
          t("user.deactivateEffectHistory"),
        ]}
        confirmLabel={
          deactivate.state.pending ? t("common.saving") : t("user.deactivateConfirm")
        }
        onConfirm={() => deactivate.submit(record.id)}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
