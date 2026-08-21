import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, LogOut } from "lucide-react";
import company from "@fixtures/demo-company.json";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { enumLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { AddressPicker } from "@/components/forms/AddressPicker";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-card p-5">
      <h2 className="mb-4 text-cardtitle">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const { role, fullName } = useSession();
  const [tab, setTab] = useState<"company" | "profile">("company");

  // Everyone can read the company record; only the owner can change it. The
  // fields stay visible and go read-only rather than disappearing — knowing
  // the company's tax number is useful even when you cannot edit it.
  const canEditCompany = role === "owner";

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

      {tab === "company" ? (
        <div className="flex max-w-4xl flex-col gap-4">
          {!canEditCompany && (
            <Alert tone="info" title={t("settings.readOnlyForRole")} />
          )}

          <Section title={t("settings.identity")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("company.fields.legalName")}
                htmlFor="co-legal"
                required
                className="sm:col-span-2"
              >
                <Input defaultValue={company.legal_name} readOnly={!canEditCompany} />
              </Field>
              <Field label={t("company.fields.displayName")} htmlFor="co-display">
                <Input defaultValue={company.display_name} readOnly={!canEditCompany} />
              </Field>
              <Field label={t("company.fields.taxOffice")} htmlFor="co-taxoffice">
                <Input defaultValue={company.tax_office} readOnly={!canEditCompany} />
              </Field>
              <Field label={t("company.fields.taxNumber")} htmlFor="co-taxno">
                <Input
                  defaultValue={company.tax_number}
                  className="font-mono tnum"
                  readOnly={!canEditCompany}
                />
              </Field>
              <Field label={t("company.fields.mersisNumber")} htmlFor="co-mersis">
                <Input
                  defaultValue={company.mersis_number}
                  className="font-mono tnum"
                  readOnly={!canEditCompany}
                />
              </Field>
              <Field label={t("company.fields.tradeRegistryNumber")} htmlFor="co-registry">
                <Input defaultValue={company.trade_registry_number} className="font-mono" readOnly={!canEditCompany} />
              </Field>
            </div>
          </Section>

          <Section title={t("settings.contact")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("company.fields.phone")} htmlFor="co-phone">
                <Input defaultValue={company.phone} readOnly={!canEditCompany} />
              </Field>
              <Field label={t("company.fields.email")} htmlFor="co-email">
                <Input
                  type="email"
                  defaultValue={company.email}
                  readOnly={!canEditCompany}
                />
              </Field>
              <Field
                label={t("company.fields.website")}
                htmlFor="co-website"
                className="sm:col-span-2"
              >
                <Input defaultValue={company.website} readOnly={!canEditCompany} />
              </Field>
            </div>
          </Section>

          <Section title={t("settings.address")}>
            <AddressPicker />
          </Section>

          {canEditCompany && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm">
                {t("form.discard")}
              </Button>
              <Button size="sm">{t("common.save")}</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex max-w-2xl flex-col gap-4">
          <Section title={t("settings.profileTab")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("user.fields.firstName")} htmlFor="pr-first">
                <Input defaultValue={fullName?.split(" ")[0] ?? ""} />
              </Field>
              <Field label={t("user.fields.lastName")} htmlFor="pr-last">
                <Input defaultValue={fullName?.split(" ").slice(1).join(" ") ?? ""} />
              </Field>
              <Field label={t("user.fields.email")} htmlFor="pr-email">
                <Input type="email" defaultValue={company.owner_email} readOnly />
              </Field>
              <Field label={t("user.fields.role")} htmlFor="pr-role">
                <Input defaultValue={role ? enumLabel("user.role", role) : ""} readOnly />
              </Field>
            </div>
          </Section>

          <Section title={t("auth.password")}>
            <Button variant="secondary" size="sm">
              <Lock />
              {t("settings.changePassword")}
            </Button>
          </Section>

          <Section title={t("settings.activeSessions")}>
            <Button variant="secondary" size="sm">
              <LogOut />
              {t("settings.signOutOthers")}
            </Button>
          </Section>
        </div>
      )}
    </div>
  );
}
