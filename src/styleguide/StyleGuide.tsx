import { useTranslation } from "react-i18next";
import { Moon, Sun, Pencil, Trash2, Printer, Search } from "lucide-react";
import demoElevators from "@fixtures/demo-elevators.json";
import { useTheme } from "@/lib/theme";
import { formatDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { InspectionLabel } from "@/components/ui/inspection-label";
import {
  ElevatorStatusChip,
  ContractStatusChip,
  RoleChip,
  UnknownEnumChip,
} from "@/components/ui/status-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableCellStacked,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ELEVATOR_STATUSES = ["active", "suspended", "sealed", "out_of_service", "uncontracted"];
const CONTRACT_STATUSES = ["draft", "active", "expired", "terminated", "renewed"];
const ROLES = ["owner", "admin", "operations", "technician", "accountant"];
const LABELS = ["green", "blue", "yellow", "red", "none"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-section text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Living reference for the design system. Not part of the product surface —
 * it exists so token and component changes can be reviewed against the design
 * without opening a product screen.
 */
export function StyleGuide() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-10 py-3">
          <div className="flex flex-col">
            <span className="text-cardtitle">{t("styleguide.title")}</span>
            <span className="text-help text-muted-foreground">{t("styleguide.subtitle")}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={toggle}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {t("styleguide.toggleTheme")}
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1320px] flex-col gap-16 px-10 py-10">
        <Section title={t("styleguide.sections.typography")}>
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5">
              <p className="text-title">{t("elevator.title")}</p>
              <p className="text-section">{t("elevator.tabs.inspection")}</p>
              <p className="text-cardtitle">{t("customerContact.fields.isPrimary")}</p>
              <p className="text-body">{t("styleguide.labelRule")}</p>
              <p className="text-label">{t("elevator.fields.inspectionReportNumber")}</p>
              <p className="text-cell">{t("elevator.fields.registrationNumber")}</p>
              <p className="text-help text-muted-foreground">
                {t("elevator.hints.maintenanceInterval")}
              </p>
              <p className="text-colhead uppercase text-muted-foreground">
                {t("elevator.fields.nextInspectionDate")}
              </p>
            </CardContent>
          </Card>
        </Section>

        <Section title={t("styleguide.sections.buttons")}>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">{t("common.save")}</Button>
            <Button variant="secondary">{t("common.cancel")}</Button>
            <Button variant="destructive">{t("contract.actions.terminate")}</Button>
            <Button variant="ghost">{t("common.edit")}</Button>
            <Button variant="link">{t("common.download")}</Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Button size="xs" variant="secondary">
              {t("common.edit")}
            </Button>
            <Button size="sm">{t("common.save")}</Button>
            <Button size="md" variant="secondary">
              <Search />
              {t("common.search")}
            </Button>
            <Button size="lg">{t("common.continue")}</Button>
            <Button size="xl">{t("qr.scanPrompt")}</Button>
            <Button size="sm" disabled>
              {t("common.deletePermanently")}
            </Button>
          </div>
        </Section>

        <Section title={t("styleguide.sections.fields")}>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field
              label={t("elevator.fields.registrationNumber")}
              htmlFor="sg-reg"
              required
              hint={t("common.required")}
            >
              <Input placeholder="34-2019-004512" className="font-mono tnum" />
            </Field>
            <Field
              label={t("customer.fields.taxNumber")}
              htmlFor="sg-tax"
              error={t("errors.INVALID_TAX_NUMBER")}
            >
              <Input defaultValue="123456789" invalid className="font-mono tnum" />
            </Field>
            <Field
              label={t("elevator.fields.maintenanceIntervalDays")}
              htmlFor="sg-interval"
              hint={t("elevator.hints.maintenanceInterval")}
            >
              <Input type="number" defaultValue={30} />
            </Field>
            <Field label={t("elevator.fields.qrToken")} htmlFor="sg-qr">
              <Input readOnly defaultValue="V1StGXR8Z5jd" className="font-mono" />
            </Field>
            <Field
              label={t("elevator.fields.notes")}
              htmlFor="sg-notes"
              className="sm:col-span-2"
            >
              <Textarea placeholder={t("common.optional")} />
            </Field>
          </div>
        </Section>

        <Section title={t("styleguide.sections.status")}>
          <div className="grid max-w-3xl gap-3">
            <Alert tone="success" title={t("common.save")} />
            <Alert tone="info" title={t("elevator.hints.mostFieldsOptional")} />
            <Alert tone="warning" title={t("elevator.hints.noCarDoor")} />
            <Alert tone="error" title={t("errors.INVALID_TAX_NUMBER")} />
          </div>
          <p className="max-w-3xl text-help text-muted-foreground">
            {t("styleguide.labelRule")}
          </p>
        </Section>

        <Section title={t("styleguide.sections.chips")}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {ELEVATOR_STATUSES.map((s) => (
                <ElevatorStatusChip key={s} value={s} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {CONTRACT_STATUSES.map((s) => (
                <ContractStatusChip key={s} value={s} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ROLES.map((r) => (
                <RoleChip key={r} value={r} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UnknownEnumChip value="roped_hydraulic" />
              <UnknownEnumChip value="panoramic_lift" />
            </div>
          </div>
        </Section>

        <Section title={t("styleguide.sections.labels")}>
          <div className="flex flex-wrap items-center gap-6">
            {LABELS.map((l) => (
              <InspectionLabel key={l} value={l} />
            ))}
          </div>
        </Section>

        <Section title={t("styleguide.sections.table")}>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{t("elevator.title")}</CardTitle>
              <p className="text-help text-muted-foreground">
                {t("styleguide.densityNote")}
              </p>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("elevator.fields.registrationNumber")}</TableHead>
                  <TableHead>{t("elevator.singular")}</TableHead>
                  <TableHead>{t("elevator.fields.brand")}</TableHead>
                  <TableHead className="text-right">
                    {t("elevator.fields.stopCount")}
                  </TableHead>
                  <TableHead>{t("elevator.fields.status")}</TableHead>
                  <TableHead>{t("elevator.fields.inspectionLabel")}</TableHead>
                  <TableHead>{t("elevator.fields.nextInspectionDate")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demoElevators.map((row) => (
                  <TableRow key={row.registration_number}>
                    <TableCell className="font-mono tnum">{row.registration_number}</TableCell>
                    <TableCell>
                      <TableCellStacked primary={row.name} secondary={row.building} />
                    </TableCell>
                    <TableCell>
                      <TableCellStacked primary={row.brand} secondary={row.model} />
                    </TableCell>
                    <TableCell numeric>{formatNumber(row.stop_count)}</TableCell>
                    <TableCell>
                      <ElevatorStatusChip value={row.status} />
                    </TableCell>
                    <TableCell>
                      <InspectionLabel value={row.inspection_label} />
                    </TableCell>
                    <TableCell className="tnum text-muted-foreground">
                      {formatDate(row.next_inspection_date) || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="iconXs" variant="ghost" aria-label={t("qr.printLabels")}>
                          <Printer />
                        </Button>
                        <Button size="iconXs" variant="ghost" aria-label={t("common.edit")}>
                          <Pencil />
                        </Button>
                        <Button size="iconXs" variant="ghost" aria-label={t("common.delete")}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3">
              <span className="text-help text-muted-foreground tnum">
                {t("common.resultRange", { from: 1, to: 6, total: 342 })}
              </span>
              <div className="flex gap-2">
                <Button size="xs" variant="secondary" disabled>
                  {t("common.back")}
                </Button>
                <Button size="xs" variant="secondary">
                  {t("common.next")}
                </Button>
              </div>
            </div>
          </Card>
        </Section>
      </main>
    </div>
  );
}
