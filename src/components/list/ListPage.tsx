import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "./EmptyState";

export interface ListColumn<T> {
  /** Translation key for the header. */
  key: string;
  cell: (row: T) => React.ReactNode;
  /** Pinned on narrow screens while the rest scrolls sideways. */
  sticky?: boolean;
  hideOnMobile?: boolean;
  numeric?: boolean;
}

export interface ListFilter {
  labelKey: string;
  count?: number;
}

export interface ActiveFilter {
  labelKey: string;
  value: string;
}

interface ListPageProps<T> {
  breadcrumbKey: string;
  titleKey: string;
  primaryActionKey?: string;
  /** Where the primary action goes. Renders a plain button when omitted. */
  primaryActionTo?: string;
  exportable?: boolean;
  filters?: ListFilter[];
  activeFilters?: ActiveFilter[];
  columns: ListColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  total: number;
  pageSize?: number;
  selectable?: boolean;
  /** Rendered inside the selection strip; receives the selected ids. */
  bulkActions?: (selected: string[]) => React.ReactNode;
  emptyTitleKey: string;
  prerequisite?: { labelKey: string; to: string };
}

function FilterButton({ label, count }: { label: string; count?: number }) {
  return (
    <button
      type="button"
      className="inline-flex h-control-sm items-center gap-1.5 rounded-md border border-input bg-card px-3 text-body text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-ring pointer-coarse:h-control-md"
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

/**
 * The shared shape of every list screen.
 *
 * All five lists behave identically on purpose: same filter bar, same
 * server-side pagination, same selection strip, same mobile behaviour. Someone
 * who has learned the elevator list has learned all of them.
 */
export function ListPage<T>({
  breadcrumbKey,
  titleKey,
  primaryActionKey,
  primaryActionTo,
  exportable,
  filters,
  activeFilters,
  columns,
  rows,
  rowKey,
  total,
  pageSize = 25,
  selectable,
  bulkActions,
  emptyTitleKey,
  prerequisite,
}: ListPageProps<T>) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  // Six controls stacked vertically push the table off a phone screen, so the
  // filters collapse behind one button below md. Search stays out: it is the
  // control people reach for first.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const ids = rows.map(rowKey);
  const allSelected = ids.length > 0 && selected.length === ids.length;
  const hasActiveFilters = Boolean(activeFilters && activeFilters.length > 0);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6 pb-4">
        <div className="flex flex-col gap-1">
          <nav className="flex items-center gap-1.5 text-help text-muted-foreground">
            <span>{t(breadcrumbKey)}</span>
            <ChevronRight className="size-3" aria-hidden="true" />
            <span className="text-foreground">{t(titleKey)}</span>
          </nav>
          <h1 className="text-title">{t(titleKey)}</h1>
        </div>
        <div className="flex items-center gap-2">
          {exportable && (
            <Button variant="secondary" size="sm">
              <Download />
              {t("list.export")}
            </Button>
          )}
          {primaryActionKey &&
            (primaryActionTo ? (
              <Link to={primaryActionTo} className={buttonVariants({ size: "sm" })}>
                <Plus />
                {t(primaryActionKey)}
              </Link>
            ) : (
              <Button size="sm">
                <Plus />
                {t(primaryActionKey)}
              </Button>
            ))}
        </div>
      </div>

      {filters && filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
          <label className="relative flex min-w-56 flex-1 items-center sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 size-4 text-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={t("common.search")}
              className="h-control-sm w-full rounded-md border border-input bg-card pl-9 pr-3 text-body placeholder:text-subtle focus-ring pointer-coarse:h-control-md"
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            className="md:hidden"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal />
            {filtersOpen ? t("list.hideFilters") : t("list.filters")}
            {activeFilters && activeFilters.length > 0 && (
              <span className="tnum rounded-sm bg-primary-soft px-1.5 text-help font-medium text-primary">
                {activeFilters.length}
              </span>
            )}
          </Button>

          <div
            className={cn(
              "w-full flex-wrap items-center gap-2 md:flex md:w-auto md:flex-1",
              filtersOpen ? "flex" : "hidden",
            )}
          >
            {filters.map((filter) => (
              <FilterButton key={filter.labelKey} label={t(filter.labelKey)} count={filter.count} />
            ))}
            <div className="md:ml-auto">
              <Button variant="secondary" size="sm">
                <Columns3 />
                {t("list.columns")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
          <span className="text-help text-muted-foreground">{t("list.activeFilters")}</span>
          {activeFilters!.map((filter) => (
            <span
              key={`${filter.labelKey}-${filter.value}`}
              className="inline-flex items-center gap-1.5 rounded-sm border-[1.5px] border-primary bg-primary-soft px-2 py-0.5 text-help text-primary"
            >
              <span className="text-muted-foreground">{t(filter.labelKey)}:</span>
              {filter.value}
              <X className="size-3 cursor-pointer" aria-hidden="true" />
            </span>
          ))}
          <button type="button" className="text-help text-primary hover:underline">
            {t("list.clearAll")}
          </button>
        </div>
      )}

      {selectable && selected.length > 0 && (
        <div className="mx-6 mb-2 flex flex-wrap items-center gap-3 rounded-md bg-primary-soft px-3 py-2">
          <span className="text-body font-medium text-primary">
            {t("common.selectedCount", { count: selected.length })}
          </span>
          {bulkActions?.(selected)}
          {/* Kept distinct from "everything on this page": the gap between 25
              and the full filtered set is where bulk actions go wrong. */}
          <button type="button" className="text-help text-primary hover:underline">
            {t("list.selectAllInFilter", { count: total })}
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

      <div className="mx-6 mb-4 overflow-hidden rounded-lg border border-border-subtle bg-card">
        {rows.length === 0 ? (
          <EmptyState
            filtered={hasActiveFilters}
            titleKey={emptyTitleKey}
            prerequisite={prerequisite}
            actionKey={primaryActionKey}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-cell">
                <thead className="border-b border-border bg-background">
                  <tr>
                    {selectable && (
                      <th className="sticky left-0 z-10 w-10 bg-background px-3">
                        <input
                          type="checkbox"
                          aria-label={t("common.actions")}
                          checked={allSelected}
                          onChange={() => setSelected(allSelected ? [] : ids)}
                          className="size-4 rounded-xs accent-primary"
                        />
                      </th>
                    )}
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(
                          "h-8 px-3 text-colhead uppercase text-muted-foreground whitespace-nowrap",
                          column.numeric ? "text-right" : "text-left",
                          column.sticky && "sticky z-10 bg-background",
                          column.sticky && (selectable ? "left-10" : "left-0"),
                          column.hideOnMobile && "hidden md:table-cell",
                        )}
                      >
                        {t(column.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const id = rowKey(row);
                    return (
                      <tr
                        key={id}
                        data-selected={selected.includes(id) || undefined}
                        className="group h-14 border-b border-border-subtle transition-colors last:border-0 hover:bg-muted data-[selected]:bg-selected md:h-control-md"
                      >
                        {selectable && (
                          <td className="sticky left-0 z-10 bg-card px-3 group-hover:bg-muted md:static md:bg-transparent">
                            <input
                              type="checkbox"
                              aria-label={id}
                              checked={selected.includes(id)}
                              onChange={() =>
                                setSelected((current) =>
                                  current.includes(id)
                                    ? current.filter((x) => x !== id)
                                    : [...current, id],
                                )
                              }
                              className="size-4 rounded-xs accent-primary"
                            />
                          </td>
                        )}
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn(
                              "px-3",
                              column.numeric && "tnum text-right",
                              column.sticky &&
                                "sticky z-10 bg-card group-hover:bg-muted md:static md:bg-transparent",
                              column.sticky && (selectable ? "left-10" : "left-0"),
                              column.hideOnMobile && "hidden md:table-cell",
                            )}
                          >
                            {column.cell(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
              <span className="tnum text-help text-muted-foreground">
                {t("common.resultRange", {
                  from: 1,
                  to: Math.min(pageSize, total),
                  total: formatNumber(total),
                })}
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
                  <span className="tnum px-2 text-help text-muted-foreground">
                    1 / {Math.max(1, Math.ceil(total / pageSize))}
                  </span>
                  <Button size="iconXs" variant="secondary" aria-label={t("common.next")}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
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

/** Two-line cell: the identifier on top, the context that would otherwise need its own column below. */
export function Stacked({
  primary,
  secondary,
  mono,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className={cn("text-cell", mono && "font-mono tnum")}>{primary}</span>
      {secondary && <span className="truncate text-help text-muted-foreground">{secondary}</span>}
    </div>
  );
}
