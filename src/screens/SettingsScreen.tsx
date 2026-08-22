import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  companyKeys,
  companyLogoQuery,
  companyQuery,
  currentUserQuery,
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
import { AddressSelect } from "@/components/forms/AddressSelect";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { SessionList } from "@/components/settings/SessionList";
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

// `labelKey`, not `label`: that is the spelling scripts/check-i18n-keys.mjs
// recognises, and a key it cannot see is a key it reports as unused — which is
// an invitation to delete a string that is very much on the screen.
const TABS = [
  { key: "company", path: "/settings", labelKey: "settings.companyTab" },
  { key: "profile", path: "/settings/profile", labelKey: "settings.profileTab" },
] as const;

/**
 * Two tabs, one per route rather than one piece of local state.
 *
 * The profile tab now holds a password form and a list of signed-in devices,
 * which is the half of this screen somebody is sent to — "check your sessions",
 * "change your password" — and a tab that only exists after a click cannot be
 * linked to, cannot be returned to with the back button, and is never rendered
 * by anything that walks the route tree. The user menu points straight at it,
 * and the render smoke test now covers it for every role.
 *
 * Each tab also fetches only what it shows: the company record is not asked for
 * to render a page about the signed-in person.
 */
export function SettingsScreen() {
  return <Settings tab="company" />;
}

/** The profile half, addressed by its own route. */
export function ProfileSettingsScreen() {
  return <Settings tab="profile" />;
}

function Settings({ tab }: { tab: (typeof TABS)[number]["key"] }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-title">{t("company.title")}</h1>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((entry) => (
          <Link
            key={entry.key}
            to={entry.path}
            className={cn(
              "flex h-control-md items-center px-3 text-body transition-colors focus-ring",
              tab === entry.key
                ? "border-b-2 border-primary font-medium text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(entry.labelKey)}
          </Link>
        ))}
      </div>

      {tab === "company" ? <CompanyTab /> : <ProfileTab />}
    </div>
  );
}

/**
 * Fetching the company record, separately from the form that writes it.
 *
 * The form takes the record as a prop and builds its uncontrolled inputs from
 * it, so it must not exist before the record does — a form keyed on a value
 * that arrives later is a form whose fields are blank and stay blank.
 */
function CompanyTab() {
  const { t } = useTranslation();
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

  return <CompanyForm record={company.data} />;
}

/**
 * The company record: read by everybody, written by its owner.
 *
 * The fields stay visible for the other roles and go read-only rather than
 * disappearing — knowing the firm's tax number is useful to an accountant who
 * may not change it, and a field that vanishes reads as a field that is empty.
 */
function CompanyForm({ record }: { record: Company }) {
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
 * The signed-in person, and what they can do about their own access.
 *
 * Both controls here were removed once, and correctly: there was no
 * authenticated password-change operation and no session resource at all, so
 * the honest screen was one that explained what ends a session rather than one
 * offering a button that would have ended the wrong one. Both endpoints exist
 * now, and the explanations have been replaced by the things they were standing
 * in for.
 */
function ProfileTab() {
  const { t } = useTranslation();
  const { role } = useSession();
  const me = useQuery(currentUserQuery());

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
        <ChangePasswordForm />
      </Section>

      <Section title={t("settings.activeSessions")}>
        <SessionList />
      </Section>
    </div>
  );
}
