import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Plus,
  Printer,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import demoElevators from "@fixtures/demo-elevators.json";
import { cn } from "@/lib/utils";
import { enumLabel } from "@/lib/i18n";
import { formatDate, formatNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ElevatorStatusChip } from "@/components/ui/status-chip";
import { InspectionLabel } from "@/components/ui/inspection-label";

/** Seven columns, chosen for what someone scanning 500 rows actually needs.
 *  Below md the three context columns drop and the identifier goes sticky —
 *  the table stays a table, it never becomes a card grid. */
interface Column {
  key: string;
  sticky?: boolean;
  hideOnMobile?: boolean;
}

const COLUMNS: Column[] = [
  { key: "elevator.fields.registrationNumber", sticky: true },
  { key: "elevator.singular", hideOnMobile: true },
  { key: "building.singular", hideOnMobile: true },
  { key: "elevator.fields.status" },
  { key: "elevator.fields.inspectionLabel" },
  { key: "elevator.fields.nextInspectionDate" },
  { key: "elevator.fields.brand", hideOnMobile: true },
];

const TOTAL = 342;
const PAGE_SIZE = 25;

function FilterButton({ label, count }: { label: string; count?: number }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-control-sm items-center gap-1.5 rounded-md border border-input bg-card px-3",
        "text-body text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-ring",
        "pointer-coarse:h-control-md",
      )}
    >
      {label}
      {count != null && (
        <span className="tnum rounded-sm bg-primary-soft px-1.5 text-help font-medium text-primary">
          {count}
        </span>
      )}
    </button>
  );
}

function ActiveFilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border-[1.5px] border-primary bg-primary-soft px-2 py-0.5 text-help text-primary">
      <span className="text-muted-foreground">{label}:</span>
      {value}
      <X className="size-3 cursor-pointer" aria-hidden="true" />
    </span>
  );
}

export function ElevatorListScreen() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);

  const allOnPage = demoElevators.map((row) => row.id);
  const allSelected = selected.length === allOnPage.length;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  return (
    <div className="flex flex-col">
      {/* Page header ------------------------------------------------------ */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <span>{t("nav.groups.records")}</span>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{t("elevator.title")}</span>
          </nav>
          <h1 className="text-title">{t("elevator.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">
            <Download />
            {t("list.export")}
          </Button>
          <Button size="sm">
            <Plus />
            {t("elevator.hints.addElevator")}
          </Button>
        </div>
      </div>

      {/* Filter bar ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <label className="relative flex min-w-56 flex-1 items-center sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 size-4 text-subtle" aria-hidden="true" />
          <input
            type="search"
            placeholder={t("common.search")}
            className="h-control-sm w-full rounded-md border border-input bg-card pl-9 pr-3 text-body placeholder:text-subtle focus-ring pointer-coarse:h-control-md"
          />
        </label>
        <FilterButton label={t("elevator.fields.status")} />
        <FilterButton label={t("elevator.fields.inspectionLabel")} count={2} />
        <FilterButton label={t("building.singular")} />
        <FilterButton label={t("customer.singular")} count={1} />
        <FilterButton label={t("elevator.fields.category")} />
        <div className="ml-auto">
          <Button variant="secondary" size="sm">
            <Columns3 />
            {t("list.columns")}
          </Button>
        </div>
      </div>

      {/* Active filters — the URL carries these, so the view is shareable. */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
        <span className="text-help text-muted-foreground">{t("list.activeFilters")}</span>
        <ActiveFilterChip
          label={t("elevator.fields.inspectionLabel")}
          value={enumLabel("elevator.inspectionLabel", "yellow")}
        />
        <ActiveFilterChip
          label={t("elevator.fields.inspectionLabel")}
          value={enumLabel("elevator.inspectionLabel", "red")}
        />
        <ActiveFilterChip label={t("customer.singular")} value={demoElevators[3].customer} />
        <button type="button" className="text-help text-primary hover:underline">
          {t("list.clearAll")}
        </button>
      </div>

      {/* Selection strip -------------------------------------------------- */}
      {selected.length > 0 && (
        <div className="mx-6 mb-2 flex flex-wrap items-center gap-3 rounded-md bg-primary-soft px-3 py-2">
          <span className="text-body font-medium text-primary">
            {t("list.selectedElevators", { count: selected.length })}
          </span>
          <Button size="xs" variant="secondary">
            <Printer />
            {t("qr.printSelected")}
          </Button>
          <Button size="xs" variant="secondary">
            {t("list.changeStatus")}
          </Button>
          <Button size="xs" variant="secondary">
            {t("contract.actions.addElevator")}
          </Button>
          {/* Kept distinct from "select all on this page": printing labels for
              25 rows versus 342 is an expensive difference to get wrong. */}
          <button type="button" className="text-help text-primary hover:underline">
            {t("list.selectAllInFilter", { count: TOTAL })}
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="ml-auto text-help text-muted-foreground hover:underline"
          >
            {t("list.clearSelection")}
          </button>
        </div>
      )}

      {/* Table ------------------------------------------------------------ */}
      <div className="mx-6 mb-4 overflow-hidden rounded-lg border border-border-subtle bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-cell">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="sticky left-0 z-10 w-10 bg-background px-3">
                  <input
                    type="checkbox"
                    aria-label={t("common.actions")}
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : allOnPage)}
                    className="size-4 rounded-xs accent-primary"
                  />
                </th>
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn(
                      "h-8 px-3 text-left text-colhead uppercase text-muted-foreground whitespace-nowrap",
                      column.sticky && "sticky left-10 z-10 bg-background",
                      column.hideOnMobile && "hidden md:table-cell",
                    )}
                  >
                    {t(column.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {demoElevators.map((row) => (
                <tr
                  key={row.id}
                  data-selected={selected.includes(row.id) || undefined}
                  className="group h-14 border-b border-border-subtle transition-colors last:border-0 hover:bg-muted data-[selected]:bg-selected md:h-control-md"
                >
                  <td className="sticky left-0 z-10 bg-card px-3 group-hover:bg-muted md:static md:bg-transparent">
                    <input
                      type="checkbox"
                      aria-label={row.registration_number}
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                      className="size-4 rounded-xs accent-primary"
                    />
                  </td>
                  {/* Sticky on narrow screens so the identifier stays put while
                      the rest scrolls sideways. The building moves in underneath
                      it because its own column is hidden at this width. */}
                  <td className="sticky left-10 z-10 bg-card px-3 font-mono tnum whitespace-nowrap group-hover:bg-muted md:static md:bg-transparent">
                    <span className="flex flex-col leading-tight">
                      {row.registration_number}
                      <span className="truncate font-sans text-help text-muted-foreground md:hidden">
                        {row.building}
                      </span>
                    </span>
                  </td>
                  {/* Three stacked columns are what take this table from 12
                      columns to 7 — the reason it never scrolls sideways. */}
                  <td className="hidden px-3 md:table-cell">
                    <div className="flex flex-col leading-tight">
                      <span className="text-cell">{row.name}</span>
                      <span className="flex items-center gap-1.5 text-help text-muted-foreground">
                        {row.category ? (
                          enumLabel("elevator.category", row.category)
                        ) : (
                          <span className="italic">{t("elevator.hints.categoryMissing")}</span>
                        )}
                        {row.stop_count != null && (
                          <span>· {t("elevator.hints.stopCount", { count: row.stop_count })}</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-3 md:table-cell">
                    <div className="flex flex-col leading-tight">
                      <span className="text-cell">{row.building}</span>
                      <span className="truncate text-help text-muted-foreground">
                        {row.customer}
                      </span>
                    </div>
                  </td>
                  <td className="px-3">
                    <div className="flex flex-col items-start gap-1">
                      <ElevatorStatusChip value={row.status} />
                      {/* A serious non-conformity, so it is surfaced in the row
                          rather than buried in the record. */}
                      {!row.has_car_door && (
                        <span className="inline-flex items-center gap-1 text-help text-warning">
                          <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                          {t("elevator.hints.noCarDoorShort")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3">
                    <InspectionLabel value={row.inspection_label} />
                  </td>
                  <td className="px-3 tnum whitespace-nowrap text-muted-foreground">
                    {formatDate(row.next_inspection_date) || "—"}
                  </td>
                  <td className="hidden px-3 md:table-cell">
                    <div className="flex flex-col leading-tight">
                      <span className="text-cell">{row.brand ?? "—"}</span>
                      <span className="text-help text-muted-foreground">{row.model ?? ""}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination — server-side, never infinite scroll. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
          <span className="tnum text-help text-muted-foreground">
            {t("common.resultRange", { from: 1, to: PAGE_SIZE, total: formatNumber(TOTAL) })}
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-help text-muted-foreground">
              {t("list.perPage")}
              <select className="h-control-xs rounded-sm border border-input bg-card px-1.5 text-help focus-ring">
                <option>25</option>
                <option>50</option>
                <option>100</option>
              </select>
            </label>
            <div className="flex items-center gap-1">
              <Button size="iconXs" variant="secondary" aria-label={t("common.back")}>
                <ChevronLeft />
              </Button>
              <span className="tnum px-2 text-help text-muted-foreground">1 / 14</span>
              <Button size="iconXs" variant="secondary" aria-label={t("common.next")}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-2 px-6 pb-8 text-help text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-sm border border-border-strong px-1.5 md:hidden">
          {t("list.swipeHint")}
        </span>
        {t("list.sharableFilters")}
      </p>
    </div>
  );
}
