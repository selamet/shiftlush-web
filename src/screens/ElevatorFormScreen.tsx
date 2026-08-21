import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, CircleAlert, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import elevator from "@fixtures/demo-elevator-detail.json";

interface TabSpec {
  key: string;
  labelKey: string;
  /** Empty optional fields. Neutral: missing data is not an error. */
  empty: number;
  /** Values that fail validation. These do block saving. */
  errors: number;
}

const TABS: TabSpec[] = [
  { key: "identity", labelKey: "elevator.tabs.identity", empty: 0, errors: 0 },
  { key: "classification", labelKey: "elevator.tabs.classification", empty: 2, errors: 0 },
  { key: "technical", labelKey: "elevator.tabs.technical", empty: 5, errors: 0 },
  { key: "manufacturing", labelKey: "elevator.tabs.manufacturing", empty: 3, errors: 0 },
  { key: "inspection", labelKey: "elevator.tabs.inspection", empty: 0, errors: 1 },
  { key: "attachments", labelKey: "elevator.tabs.attachments", empty: 4, errors: 0 },
];

const FILLED = 21;
const TOTAL_FIELDS = 31;

const ELEVATOR_STATUSES = ["active", "suspended", "sealed", "out_of_service"];

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: TabSpec;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex h-control-md items-center gap-2 whitespace-nowrap px-3 text-body transition-colors focus-ring",
        active
          ? "border-b-2 border-primary font-medium text-foreground"
          : "border-b-2 border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {t(tab.labelKey)}
      {/* Empty-field counts stay neutral grey. Red is reserved for values that
          are actually wrong — a half-filled record is normal in the field. */}
      {tab.empty > 0 && (
        <span className="tnum rounded-full bg-muted px-1.5 text-help text-muted-foreground">
          {tab.empty}
        </span>
      )}
      {tab.errors > 0 && (
        <CircleAlert className="size-3.5 text-destructive" aria-hidden="true" />
      )}
    </button>
  );
}

function RecordStatusPanel({ onGoToError }: { onGoToError: () => void }) {
  const { t } = useTranslation();
  const percent = Math.round((FILLED / TOTAL_FIELDS) * 100);
  const errorTabs = TABS.filter((tab) => tab.errors > 0);

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-5 border-l border-border-subtle bg-card p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-cardtitle">{t("form.recordStatus")}</h2>
        <div className="flex items-baseline gap-1.5">
          <span className="tnum text-title">{FILLED}</span>
          <span className="text-help text-muted-foreground">
            {t("form.fieldsFilled", { filled: FILLED, total: TOTAL_FIELDS })}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-help text-muted-foreground">{t("form.missingIsNotAnError")}</p>
      </div>

      {errorTabs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border-l-[3px] border-destructive bg-destructive-bg px-3 py-2.5">
          <span className="text-label text-destructive">
            {t("form.errorCount", { count: errorTabs.length })}
          </span>
          <span className="text-help text-destructive">
            {t("elevator.fields.nextInspectionDate")}
          </span>
          <button
            type="button"
            onClick={onGoToError}
            className="self-start text-help text-destructive underline"
          >
            {t("form.goToError")}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-colhead uppercase text-subtle">{t("form.tabsHeading")}</span>
        {TABS.map((tab) => (
          <div key={tab.key} className="flex items-center justify-between text-help">
            <span className="text-muted-foreground">{t(tab.labelKey)}</span>
            {tab.errors > 0 ? (
              <span className="text-destructive">{t("form.errorCount", { count: tab.errors })}</span>
            ) : tab.empty === 0 ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check className="size-3" aria-hidden="true" />
                {t("form.complete")}
              </span>
            ) : (
              <span className="tnum text-subtle">{tab.empty}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-4">
        <span className="text-colhead uppercase text-subtle">{t("form.validationTiming")}</span>
        <p className="text-help text-muted-foreground">{t("form.onBlur")}</p>
        <p className="text-help text-muted-foreground">{t("form.onTabChange")}</p>
        <p className="text-help text-muted-foreground">{t("form.onSave")}</p>
      </div>
    </aside>
  );
}

export function ElevatorFormScreen() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("identity");
  const [dirtyCount] = useState(4);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <span>{t("elevator.title")}</span>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{elevator.name}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title">{elevator.name}</h1>
            {dirtyCount > 0 && (
              <span className="rounded-sm border border-border-strong px-2 py-0.5 text-help text-muted-foreground">
                {t("form.unsavedChanges")}
              </span>
            )}
          </div>
          <p className="flex items-center gap-2 text-help text-muted-foreground">
            <span className="font-mono tnum">{elevator.registration_number}</span>
            <span>·</span>
            <span>{elevator.building}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-6">
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            tab={tab}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="flex max-w-2xl flex-col gap-5">
            <div className="flex items-baseline gap-2">
              <h2 className="text-section">{t(`elevator.tabs.${activeTab}`)}</h2>
              <span className="text-help text-muted-foreground">
                {t("form.fieldCount", { count: 6 })} · {t("form.requiredCount", { count: 2 })}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("elevator.fields.building")}
                htmlFor="ef-building"
                required
                className="sm:col-span-2"
              >
                <Input defaultValue={elevator.building} />
              </Field>

              <Field
                label={t("elevator.fields.registrationNumber")}
                htmlFor="ef-reg"
                required
                hint={t("form.uniqueWithinCompany")}
              >
                <Input defaultValue={elevator.registration_number} className="font-mono tnum" />
              </Field>

              <Field label={t("elevator.fields.name")} htmlFor="ef-name">
                <Input defaultValue={elevator.name} />
              </Field>

              <Field
                label={`${t("elevator.fields.internalCode")} ${t("form.optionalSuffix")}`}
                htmlFor="ef-code"
                hint={t("form.internalCodeExample")}
              >
                <Input placeholder={elevator.internal_code_example} />
              </Field>

              <Field label={t("elevator.fields.status")} htmlFor="ef-status">
                <select
                  id="ef-status"
                  defaultValue={elevator.status}
                  className="h-control-md w-full rounded-md border border-input bg-card px-3 text-body focus-ring pointer-coarse:h-control-lg"
                >
                  {ELEVATOR_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {enumLabel("elevator.status", value)}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={t("elevator.fields.maintenanceIntervalDays")}
                htmlFor="ef-interval"
                hint={t("elevator.hints.maintenanceInterval")}
              >
                <Input type="number" defaultValue={elevator.maintenance_interval_days} min={1} max={30} />
              </Field>

              <Field
                label={t("elevator.fields.notes")}
                htmlFor="ef-notes"
                className="sm:col-span-2"
              >
                <Textarea rows={3} />
              </Field>
            </div>
          </div>
        </div>

        <div className="hidden xl:block">
          <RecordStatusPanel onGoToError={() => setActiveTab("inspection")} />
        </div>
      </div>

      {/* One save for the whole record, present on every tab. Tabs are a
          navigation device, not a transaction boundary — saving per tab would
          teach the user to save six times and produce half-written records. */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border bg-card px-6 py-3">
        {dirtyCount > 0 && (
          <span className="text-help text-muted-foreground">
            {t("form.unsavedChangesBody", { count: dirtyCount })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm">
            {t("form.discard")}
          </Button>
          <Button variant="secondary" size="sm">
            {t("form.saveAndNew")}
          </Button>
          <Button size="sm">{t("form.saveAllTabs")}</Button>
        </div>
      </div>
    </div>
  );
}
