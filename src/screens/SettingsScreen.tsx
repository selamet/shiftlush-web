import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import {
  companyKeys,
  companyLogoQuery,
  companyQuery,
  currentUserQuery,
  requestPasswordReset,
  updateCompany,
  type Company,
  type CompanyWrite,
} from "@/api/queries";
import { errorMessage, supportReference } from "@/api/errors";
import { useSubmit } from "@/lib/form";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { enumLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddressSelect } from "@/components/forms/AddressSelect";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { DetailSkeleton, ListError } from "@/components/list/ListStates";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <h2 className="mb-4 text-cardtitle">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Every field the company form owns, and the label to name it by.
 *
 * One list, read twice: once to build the PATCH and once to work out what
 * "Discard" would actually throw away. They are kept together because the two
 * must not disagree — a field missing from the second reading is a change the
 * user is never warned they are about to lose.
 */
const FIELD_LABELS: Record<string, string> = {
  legal_name: "company.fields.legalName",
  display_name: "company.fields.displayName",
  tax_office: "company.fields.taxOffice",
  tax_number: "company.fields.taxNumber",
  mersis_number: "company.fields.mersisNumber",
  trade_registry_number: "company.fields.tradeRegistryNumber",
  phone: "company.fields.phone",
  email: "company.fields.email",
  website: "company.fields.website",
  neighborhood: "address.fields.neighborhood",
  street: "address.fields.street",
  building_number: "address.fields.buildingNumber",
  unit_number: "address.fields.unitNumber",
};

const FIELD_NAMES = Object.keys(FIELD_LABELS);

/** The record as the form would have submitted it, for comparing against. */
function baseline(record: Company): Record<string, string> {
  return {
    legal_name: record.legal_name,
    display_name: record.display_name,
    tax_office: record.tax_office ?? "",
    tax_number: record.tax_number ?? "",
    mersis_number: record.mersis_number ?? "",
    trade_registry_number: record.trade_registry_number ?? "",
    phone: record.phone ?? "",
    email: record.email ?? "",
    website: record.website ?? "",
    neighborhood: record.neighborhood == null ? "" : String(record.neighborhood),
    street: record.street ?? "",
    building_number: record.building_number ?? "",
    unit_number: record.unit_number ?? "",
  };
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"company" | "profile">("company");

  const company = useQuery(companyQuery());

  if (company.isPending) return <DetailSkeleton />;
  if (company.isError || !company.data) {
    return (
      <ListError
        message={errorMessage(company.error, t)}
        reference={supportReference(company.error)}
        onRetry={() => void company.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-title">{t("company.title")}</h1>

      <div className="flex gap-1 border-b border-border">
        {(["company", "profile"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex h-control-md items-center px-3 text-body transition-colors focus-ring",
              tab === key
                ? "border-b-2 border-primary font-medium text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(key === "company" ? "settings.companyTab" : "settings.profileTab")}
          </button>
        ))}
      </div>

      {tab === "company" ? <CompanyTab record={company.data} /> : <ProfileTab />}
    </div>
  );
}

/**
 * The company record: read by everybody, written by its owner.
 *
 * The fields stay visible for the other roles and go read-only rather than
 * disappearing — knowing the firm's tax number is useful to an accountant who
 * may not change it, and a field that vanishes reads as a field that is empty.
 */
function CompanyTab({ record }: { record: Company }) {
  const { t } = useTranslation();
  const { role } = useSession();
  const canEditCompany = role === "owner";

  const logos = useQuery(companyLogoQuery(record.id));

  const formRef = useRef<HTMLFormElement>(null);
  /**
   * Bumped to throw the form away and build it again.
   *
   * `form.reset()` restores the native inputs and silently misses the
   * neighbourhood: that control keeps its selection in React state and writes
   * it to a hidden input, which a reset does not touch. Discarding would have
   * left the picker showing a choice the rest of the form had already dropped.
   */
  const [formVersion, setFormVersion] = useState(0);
  const [changed, setChanged] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const details = useSubmit<CompanyWrite, Company>({
    mutationFn: (body) => updateCompany(body),
    invalidate: [companyKeys.all],
    onSuccess: () => {
      setSaved(true);
      setChanged([]);
      // The record the inputs default to has just changed. Rebuilding rebases
      // them on it, so the next comparison is against what was actually saved.
      setFormVersion((version) => version + 1);
    },
  });

  /**
   * Pointing `company.logo` at the file that just arrived.
   *
   * Separate from the form on purpose: by the time this runs the bytes are
   * already in the bucket, and holding the new logo hostage until somebody
   * presses Save would leave a file the record does not know about.
   */
  const logo = useSubmit<string, Company>({
    mutationFn: (attachmentId) => updateCompany({ logo: attachmentId }),
    invalidate: [companyKeys.all],
  });

  /**
   * What Discard would throw away, recomputed from the DOM.
   *
   * Driven by input and focus-out rather than by controlled state: these are
   * uncontrolled inputs, and the neighbourhood picker announces a change
   * through neither. Focus-out is what catches that one — choosing from its
   * list leaves the field focused, so the next click anywhere settles it.
   */
  function recompute() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const before = baseline(record);
    const next = FIELD_NAMES.filter(
      (name) => String(data.get(name) ?? "").trim() !== before[name].trim(),
    );
    setChanged((previous) =>
      previous.length === next.length && previous.every((name, index) => name === next[index])
        ? previous
        : next,
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();

    // Every field, including the empty ones. An omitted key means "leave it as
    // it was", which would make a field impossible to clear: somebody deletes
    // the website, saves, and the old address comes straight back.
    details.submit({
      legal_name: text("legal_name"),
      display_name: text("display_name"),
      tax_office: text("tax_office"),
      tax_number: text("tax_number"),
      mersis_number: text("mersis_number"),
      trade_registry_number: text("trade_registry_number"),
      phone: text("phone"),
      email: text("email"),
      website: text("website"),
      neighborhood: text("neighborhood") ? Number(text("neighborhood")) : null,
      street: text("street"),
      building_number: text("building_number"),
      unit_number: text("unit_number"),
    });
  }

  const currentLogo = logos.data?.results.find((file) => file.id === record.logo);
  // Assumed to be an image while the list is still in flight: the URL exists
  // only because the record points at something, and blanking the logo until
  // its type is confirmed would flash an empty frame on every visit.
  const logoIsImage = (currentLogo?.mime_type ?? "image/").startsWith("image/");

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {!canEditCompany && <Alert tone="info" title={t("settings.readOnlyForRole")} />}

      <form
        key={formVersion}
        ref={formRef}
        onSubmit={onSubmit}
        onInput={recompute}
        onBlur={recompute}
        className="flex flex-col gap-4"
      >
        {/* Only failures that belong to no field. A field error is already
            shown against its input; repeating it here says it twice. */}
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

        <Section title={t("settings.identity")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("company.fields.legalName")}
              htmlFor="co-legal"
              required
              className="sm:col-span-2"
              error={details.state.fields.legal_name}
            >
              <Input
                name="legal_name"
                required
                maxLength={200}
                defaultValue={record.legal_name}
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.legal_name)}
              />
            </Field>
            <Field
              label={t("company.fields.displayName")}
              htmlFor="co-display"
              required
              error={details.state.fields.display_name}
            >
              <Input
                name="display_name"
                required
                maxLength={80}
                defaultValue={record.display_name}
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.display_name)}
              />
            </Field>
            <Field
              label={t("company.fields.taxOffice")}
              htmlFor="co-taxoffice"
              error={details.state.fields.tax_office}
            >
              <Input
                name="tax_office"
                maxLength={100}
                defaultValue={record.tax_office}
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.tax_office)}
              />
            </Field>
            <Field
              label={t("company.fields.taxNumber")}
              htmlFor="co-taxno"
              // The check digit is the server's rule. Reproducing it here would
              // make it a second copy of the rule that actually decides.
              error={details.state.fields.tax_number}
            >
              <Input
                name="tax_number"
                inputMode="numeric"
                maxLength={11}
                defaultValue={record.tax_number}
                className="font-mono tnum"
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.tax_number)}
              />
            </Field>
            <Field
              label={t("company.fields.mersisNumber")}
              htmlFor="co-mersis"
              error={details.state.fields.mersis_number}
            >
              <Input
                name="mersis_number"
                inputMode="numeric"
                maxLength={16}
                defaultValue={record.mersis_number}
                className="font-mono tnum"
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.mersis_number)}
              />
            </Field>
            <Field
              label={t("company.fields.tradeRegistryNumber")}
              htmlFor="co-registry"
              error={details.state.fields.trade_registry_number}
            >
              <Input
                name="trade_registry_number"
                maxLength={30}
                defaultValue={record.trade_registry_number}
                className="font-mono"
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.trade_registry_number)}
              />
            </Field>
          </div>
        </Section>

        <Section title={t("settings.contact")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("company.fields.phone")}
              htmlFor="co-phone"
              error={details.state.fields.phone}
            >
              <Input
                name="phone"
                type="tel"
                maxLength={20}
                defaultValue={record.phone}
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.phone)}
              />
            </Field>
            <Field
              label={t("company.fields.email")}
              htmlFor="co-email"
              error={details.state.fields.email}
            >
              <Input
                name="email"
                type="email"
                maxLength={150}
                defaultValue={record.email}
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.email)}
              />
            </Field>
            <Field
              label={t("company.fields.website")}
              htmlFor="co-website"
              className="sm:col-span-2"
              error={details.state.fields.website}
            >
              <Input
                name="website"
                maxLength={150}
                defaultValue={record.website}
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.website)}
              />
            </Field>
          </div>
        </Section>

        <Section title={t("settings.address")}>
          <div className="flex flex-col gap-4">
            {/* The picker is a write control, so only the writer gets it. The
                record carries the neighbourhood's id and not its name — the
                contract puts no name on `Company` — so an empty picker is all
                there would be to show anybody who cannot change it, and an
                empty labelled field reads as an address nobody ever entered. */}
            {canEditCompany && (
              <div className="flex flex-col gap-2">
                <AddressSelect
                  name="neighborhood"
                  required={false}
                  error={details.state.fields.neighborhood}
                  initial={{
                    neighborhoodId: record.neighborhood ?? null,
                    districtName: null,
                    provinceName: null,
                  }}
                />
                {record.neighborhood != null && (
                  <p className="text-help text-muted-foreground">
                    {t("settings.neighborhoodKept")}
                  </p>
                )}
              </div>
            )}

            <Field
              label={t("address.fields.street")}
              htmlFor="co-street"
              error={details.state.fields.street}
            >
              <Input
                name="street"
                maxLength={150}
                defaultValue={record.street}
                readOnly={!canEditCompany}
                invalid={Boolean(details.state.fields.street)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("address.fields.buildingNumber")}
                htmlFor="co-building-no"
                error={details.state.fields.building_number}
              >
                <Input
                  name="building_number"
                  maxLength={20}
                  defaultValue={record.building_number}
                  className="tnum"
                  readOnly={!canEditCompany}
                  invalid={Boolean(details.state.fields.building_number)}
                />
              </Field>
              <Field
                label={t("address.fields.unitNumber")}
                htmlFor="co-unit-no"
                error={details.state.fields.unit_number}
              >
                <Input
                  name="unit_number"
                  maxLength={20}
                  defaultValue={record.unit_number}
                  className="tnum"
                  readOnly={!canEditCompany}
                  invalid={Boolean(details.state.fields.unit_number)}
                />
              </Field>
            </div>
          </div>
        </Section>

        {canEditCompany && (
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {/* Named, not counted. "Three fields changed" is not something
                anybody can check against what they remember typing. */}
            <span className="mr-auto text-help text-muted-foreground">
              {changed.length > 0
                ? t("settings.changedFields", {
                    fields: changed.map((name) => t(FIELD_LABELS[name])).join(", "),
                  })
                : saved
                  ? t("settings.saved")
                  : t("settings.noChanges")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              // A control that cannot do anything says so by being disabled.
              // One that stays live and quietly does nothing is the same fault
              // this screen was opened to fix.
              disabled={changed.length === 0 || details.state.pending}
              onClick={() => {
                setFormVersion((version) => version + 1);
                setChanged([]);
                setSaved(false);
              }}
            >
              {t("form.discard")}
            </Button>
            <Button type="submit" size="sm" disabled={details.state.pending}>
              {details.state.pending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        )}
      </form>

      {/* Outside the form: the logo is saved the moment it lands, and a file
          picker nested in a form that submits natively is a picker that can
          submit the page. */}
      <Section title={t("settings.branding")}>
        <div className="flex flex-col gap-4">
          {logo.state.message && <Alert tone="error" block title={logo.state.message} />}

          <div className="flex flex-wrap items-center gap-4">
            {record.logo_url && logoIsImage ? (
              <img
                src={record.logo_url}
                alt={t("company.fields.logo")}
                className="h-16 w-auto max-w-48 rounded-md border border-border-subtle bg-card object-contain p-1.5"
              />
            ) : (
              <span className="flex h-16 w-48 shrink-0 items-center justify-center rounded-md border border-dashed border-border-strong text-help text-muted-foreground">
                {t("settings.logoNone")}
              </span>
            )}
            <p className="text-help text-muted-foreground">{t("settings.logoHint")}</p>
          </div>

          <AttachmentsPanel
            objectType="company"
            objectId={record.id}
            attachments={logos.data?.results ?? []}
            invalidateKey={companyKeys.logos}
            canWrite={canEditCompany}
            fixedCategory="logo"
            onUploaded={(file) => logo.submit(file.id)}
          />
        </div>
      </Section>
    </div>
  );
}

/**
 * The signed-in person, and the two things they can do about their own access.
 *
 * Both are narrower than they look, and the contract is why. There is no
 * authenticated password-change operation — only the reset flow, which proves
 * the address rather than the old password — and no session resource at all,
 * so "sign out my other devices" is not something this screen can offer
 * without inventing an endpoint. What it can do is say what actually ends a
 * session, before anybody is surprised by one ending.
 */
function ProfileTab() {
  const { t } = useTranslation();
  const { role } = useSession();
  const me = useQuery(currentUserQuery());

  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState(false);

  const reset = useSubmit<string, void>({
    mutationFn: (email) => requestPasswordReset(email),
    onSuccess: () => {
      setAsking(false);
      setSent(true);
    },
  });

  if (me.isPending) return <DetailSkeleton />;
  if (me.isError || !me.data) {
    return (
      <ListError
        message={errorMessage(me.error, t)}
        reference={supportReference(me.error)}
        onRetry={() => void me.refetch()}
      />
    );
  }

  const user = me.data;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Section title={t("settings.profileTab")}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("user.fields.firstName")} htmlFor="pr-first">
              <Input defaultValue={user.first_name} readOnly />
            </Field>
            <Field label={t("user.fields.lastName")} htmlFor="pr-last">
              <Input defaultValue={user.last_name} readOnly />
            </Field>
            <Field label={t("user.fields.email")} htmlFor="pr-email">
              <Input type="email" defaultValue={user.email} readOnly />
            </Field>
            <Field label={t("user.fields.phone")} htmlFor="pr-phone">
              <Input type="tel" defaultValue={user.phone} readOnly />
            </Field>
            <Field label={t("user.fields.role")} htmlFor="pr-role">
              <Input defaultValue={role ? enumLabel("user.role", role) : ""} readOnly />
            </Field>
          </div>
          {/* Read-only rather than editable-looking. These fields live on the
              user record, and the only endpoint that writes them is the one
              user management uses — a form here that could not save would be
              the fault this screen was opened to fix, in miniature. */}
          <p className="text-help text-muted-foreground">{t("settings.profileReadOnly")}</p>
        </div>
      </Section>

      <Section title={t("auth.password")}>
        <div className="flex flex-col gap-3">
          <p className="text-body text-muted-foreground">
            {t("settings.passwordBody", { email: user.email })}
          </p>
          {reset.state.message && <Alert tone="error" block title={reset.state.message} />}
          {sent ? (
            <Alert tone="success" title={t("settings.passwordSent")} />
          ) : (
            <div>
              <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>
                <Lock aria-hidden="true" />
                {t("settings.changePassword")}
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section title={t("settings.activeSessions")}>
        {/* No button, because there is no endpoint behind one. Saying what does
            end a session is worth more than a control that would have had to
            end this one too — pressing it, landing on the login screen and
            reading that as a fault is exactly what this avoids. */}
        <p className="text-body text-muted-foreground">{t("settings.sessionsBody")}</p>
      </Section>

      {/* Asking, because the link is only useful to somebody expecting it, and
          because the consequence belongs before the action rather than after
          it: finishing the reset ends every session, this one included. */}
      <ConfirmDialog
        open={asking}
        title={t("settings.passwordConfirmTitle")}
        body={t("settings.passwordConfirmBody", { email: user.email })}
        confirmLabel={reset.state.pending ? t("common.sending") : t("auth.sendResetLink")}
        onConfirm={() => reset.submit(user.email)}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
