import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { ListParams } from "@/api/queries";
import {
  PAGE_SIZES,
  type ListFilter,
  type ListFilterOption,
  type ListState,
} from "@/lib/list-search";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { ColumnMenu, useColumnPreferences } from "./ColumnMenu";
import { ListMenu, ListMenuOption } from "./ListMenu";
import { EmptyState } from "./EmptyState";
import { ListError, TableSkeleton } from "./ListStates";

export interface ListColumn<T> {
  /** Translation key for the header. Also this column's identity in the column menu. */
  key: string;
  cell: (row: T) => React.ReactNode;
  /** The list's default pinned column: stays put while the rest scrolls sideways. */
  sticky?: boolean;
  hideOnMobile?: boolean;
  numeric?: boolean;
}

/**
 * What a bulk action is being asked to act on.
 *
 * The two cases are kept apart all the way to the action, because they are not
 * the same question. `rows` is the handful someone ticked and can see. `filter`
 * is every record matching the current query — the 4000 behind a page of 25 —
 * and it is handed over as the query rather than as ids, since those ids were
 * never fetched, and fetching them to hand them back would be a client
 * pretending it knows a set only the server can enumerate.
 */
export type ListSelection =
  | { mode: "rows"; ids: string[]; count: number }
  | { mode: "filter"; params: ListParams; count: number };

interface ListPageProps<T> {
  breadcrumbKey: string;
  titleKey: string;
  /**
   * The create action, and where it goes. Both or neither.
   *
   * There used to be a fallback rendering a plain button when the destination
   * was omitted, and it rendered a button that did nothing. No caller ever took
   * it — every screen passes both — so it was a dead branch waiting for the
   * first caller to pass a label alone and get a control that looks live.
   */
  primaryActionKey?: string;
  primaryActionTo?: string;
  /** Filter, search and paging state, from `useListSearch`. Lives in the URL. */
  state: ListState;
  /** Set only where the endpoint declares a `search` parameter. */
  searchable?: boolean;
  filters?: readonly ListFilter[];
  columns: ListColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  total: number;
  selectable?: boolean;
  /** Rendered inside the selection strip; receives what is selected. */
  bulkActions?: (selection: ListSelection) => React.ReactNode;
  emptyTitleKey: string;
  prerequisite?: { labelKey: string; to: string };
  /** True while the first page is in flight. Paging keeps the old rows instead. */
  loading?: boolean;
  /** Set when the request failed. Already translated — this component shows it. */
  error?: { message: string; reference?: string; onRetry?: () => void };
}

/** How long the typing has to stop before the term becomes a request. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The shared shape of every list screen.
 *
 * All the lists behave identically on purpose: same filter bar, same
 * server-side pagination, same selection strip, same mobile behaviour. Someone
 * who has learned the elevator list has learned all of them.
 *
 * Every control here reaches the server, and every one of them is in the URL.
 * A firm with 500 elevators cannot be narrowed in the browser, and a control
 * that narrows only the 25 rows that happen to be loaded is worse than no
 * control at all: it answers confidently and wrongly.
 */
export function ListPage<T>({
  breadcrumbKey,
  titleKey,
  primaryActionKey,
  primaryActionTo,
  state,
  searchable,
  filters,
  columns,
  rows,
  rowKey,
  total,
  selectable,
  bulkActions,
  emptyTitleKey,
  prerequisite,
  loading,
  error,
}: ListPageProps<T>) {
  const { t } = useTranslation();
  // Several controls stacked vertically push the table off a phone screen, so
  // the filters collapse behind one button below md. Search stays out: it is
  // the control people reach for first.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const path = useRouterState({ select: (router) => router.location.pathname });
  const preferences = useColumnPreferences(path, columns);
  const shown = columns.filter((column) => !preferences.isHidden(column.key));

  const ids = rows.map(rowKey);
  const selected = useSelection(ids, total, state.params);

  const lastPage = Math.max(1, Math.ceil(total / state.pageSize));
  const activeFilters = describeFilters(state, filters, t);
  const hasActiveFilters = activeFilters.length > 0;

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
        {primaryActionKey && primaryActionTo && (
          <div className="flex items-center gap-2">
            <Link to={primaryActionTo} className={buttonVariants({ size: "sm" })}>
              <Plus />
              {t(primaryActionKey)}
            </Link>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        {searchable && <SearchBox state={state} />}
        {filters && filters.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="md:hidden"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal />
            {filtersOpen ? t("list.hideFilters") : t("list.filters")}
            {activeFilters.length > 0 && (
              <span className="tnum rounded-sm bg-primary-soft px-1.5 text-help font-medium text-primary">
                {activeFilters.length}
              </span>
            )}
          </Button>
        )}

        <div
          className={cn(
            "w-full flex-wrap items-center gap-2 md:flex md:w-auto md:flex-1",
            filtersOpen ? "flex" : "hidden",
          )}
        >
          {filters?.map((filter) => {
            const value = state.filters[filter.param];

            // Nothing to draw: the value arrived on a link rather than being
            // chosen, and its chip above the table is both the notice that it
            // is applied and the way to drop it.
            if (filter.kind === "scope") return null;

            if (filter.kind === "date") {
              return (
                <label key={filter.param} className="flex items-center gap-1.5">
                  <span className="text-help whitespace-nowrap text-muted-foreground">
                    {t(filter.labelKey)}
                  </span>
                  <DatePicker
                    value={value ?? ""}
                    // "" is what the picker reports when the box is emptied,
                    // and null is what removes a filter — so the two have to be
                    // mapped onto each other here or clearing the date would
                    // put an empty parameter in the URL.
                    onChange={(iso) => state.setFilter(filter.param, iso || null)}
                    className="w-40"
                  />
                </label>
              );
            }

            const chosen = filter.options.find((option) => option.value === value);
            return (
              <ListMenu
                key={filter.param}
                label={t(filter.labelKey)}
                active={Boolean(value)}
                value={chosen ? optionLabel(chosen, t) : undefined}
                panel={(close) => (
                  <>
                    <ListMenuOption
                      role="menuitemradio"
                      checked={!value}
                      onSelect={() => {
                        state.setFilter(filter.param, null);
                        close();
                      }}
                    >
                      {t("list.allOption")}
                    </ListMenuOption>
                    {filter.options.map((option) => (
                      <ListMenuOption
                        key={option.value}
                        role="menuitemradio"
                        checked={option.value === value}
                        onSelect={() => {
                          state.setFilter(filter.param, option.value);
                          close();
                        }}
                      >
                        {optionLabel(option, t)}
                      </ListMenuOption>
                    ))}
                  </>
                )}
              >
                {t(filter.labelKey)}
              </ListMenu>
            );
          })}
        </div>

        {/* Outside the collapsing block: a column is not a filter, and a list
            with no filters has no button to open that block with — which left
            this one unreachable on a phone. */}
        <ColumnMenu columns={columns} preferences={preferences} className="ml-auto" />
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
          <span className="text-help text-muted-foreground">{t("list.activeFilters")}</span>
          {activeFilters.map((filter) => (
            <span
              key={filter.param}
              className="inline-flex items-center gap-1.5 rounded-sm border-[1.5px] border-primary bg-primary-soft py-0.5 pl-2 text-help text-primary"
            >
              <span className="text-muted-foreground">{t(filter.labelKey)}:</span>
              {filter.value}
              <button
                type="button"
                aria-label={t("list.removeFilter")}
                onClick={filter.remove}
                className="hit-40 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-primary hover:text-primary-foreground focus-ring"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={state.clearAll}
            className="text-help text-primary hover:underline focus-ring"
          >
            {t("list.clearAll")}
          </button>
        </div>
      )}

      {selectable && selected.value.count > 0 && (
        <div className="mx-6 mb-2 flex flex-wrap items-center gap-3 rounded-md bg-primary-soft px-3 py-2">
          <span className="text-body font-medium text-primary">
            {t("common.selectedCount", { count: selected.value.count })}
          </span>
          {bulkActions?.(selected.value)}
          {/* Kept distinct from "everything on this page": the gap between 25
              and the full filtered set is where bulk actions go wrong. Offered
              only while there is a gap, and only until it has been taken. */}
          {selected.value.mode === "rows" && total > ids.length && (
            <button
              type="button"
              onClick={selected.selectFilter}
              className="text-help text-primary hover:underline focus-ring"
            >
              {t("list.selectAllInFilter", { count: total })}
            </button>
          )}
          <button
            type="button"
            onClick={selected.clear}
            className="ml-auto text-help text-muted-foreground hover:underline focus-ring"
          >
            {t("list.clearSelection")}
          </button>
        </div>
      )}

      <div className="mx-6 mb-4 overflow-hidden rounded-lg border border-border-subtle bg-card">
        {error ? (
          <ListError {...error} />
        ) : loading ? (
          <TableSkeleton columns={shown.length + (selectable ? 1 : 0)} />
        ) : rows.length === 0 ? (
          <EmptyState
            filtered={hasActiveFilters}
            titleKey={emptyTitleKey}
            prerequisite={prerequisite}
            actionKey={primaryActionKey}
            actionTo={primaryActionTo}
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
                          checked={selected.allOnPage}
                          onChange={selected.toggleAll}
                          className="size-4 rounded-xs accent-primary"
                        />
                      </th>
                    )}
                    {shown.map((column) => {
                      const pinned = preferences.pinnedKey === column.key;
                      return (
                        <th
                          key={column.key}
                          scope="col"
                          className={cn(
                            "h-8 px-3 text-colhead uppercase text-muted-foreground whitespace-nowrap",
                            column.numeric ? "text-right" : "text-left",
                            pinned && "sticky z-10 bg-background",
                            pinned && (selectable ? "left-10" : "left-0"),
                            column.hideOnMobile && "hidden md:table-cell",
                          )}
                        >
                          {t(column.key)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const id = rowKey(row);
                    const checked = selected.includes(id);
                    return (
                      <tr
                        key={id}
                        data-selected={checked || undefined}
                        className="group h-14 border-b border-border-subtle transition-colors last:border-0 hover:bg-muted data-[selected]:bg-selected md:h-control-md"
                      >
                        {selectable && (
                          <td className="sticky left-0 z-10 bg-card px-3 group-hover:bg-muted md:static md:bg-transparent">
                            <input
                              type="checkbox"
                              aria-label={id}
                              checked={checked}
                              onChange={() => selected.toggleRow(id)}
                              className="size-4 rounded-xs accent-primary"
                            />
                          </td>
                        )}
                        {shown.map((column) => {
                          const pinned = preferences.pinnedKey === column.key;
                          return (
                            <td
                              key={column.key}
                              className={cn(
                                "px-3",
                                column.numeric && "tnum text-right",
                                pinned &&
                                  "sticky z-10 bg-card group-hover:bg-muted md:static md:bg-transparent",
                                pinned && (selectable ? "left-10" : "left-0"),
                                column.hideOnMobile && "hidden md:table-cell",
                              )}
                            >
                              {column.cell(row)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
              <span className="tnum text-help text-muted-foreground">
                {t("common.resultRange", {
                  // Empty pages read as "0 – 0", which looks like a fault; the
                  // range starts at 1 only when there is something on it.
                  from: total === 0 ? 0 : (state.page - 1) * state.pageSize + 1,
                  to: Math.min(state.page * state.pageSize, total),
                  total: formatNumber(total),
                })}
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-help text-muted-foreground">
                  {t("list.perPage")}
                  <select
                    value={state.pageSize}
                    onChange={(event) => state.setPageSize(Number(event.target.value))}
                    className="h-control-xs rounded-sm border border-input bg-card px-1.5 text-help focus-ring"
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    size="iconXs"
                    variant="secondary"
                    aria-label={t("common.back")}
                    disabled={state.page <= 1}
                    onClick={() => state.setPage(state.page - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <span className="tnum px-2 text-help text-muted-foreground">
                    {state.page} / {lastPage}
                  </span>
                  <Button
                    size="iconXs"
                    variant="secondary"
                    aria-label={t("common.next")}
                    disabled={state.page >= lastPage}
                    onClick={() => state.setPage(state.page + 1)}
                  >
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

/**
 * The search box, held locally and pushed to the URL once the typing stops.
 *
 * Two reasons it is not driven straight from the URL: a request per keystroke
 * against a 4000-row table, and a history entry per keystroke, which would turn
 * the back button into a way of spelling the word backwards. The local value
 * still follows the URL when the URL moves on its own — the back button, or
 * "clear all" — or the box would go on showing a term nothing is filtered by.
 */
function SearchBox({ state }: { state: ListState }) {
  const { t } = useTranslation();
  const [term, setTerm] = useState(state.search);
  const [applied, setApplied] = useState(state.search);
  const { setSearch } = state;

  if (applied !== state.search) {
    setApplied(state.search);
    setTerm(state.search);
  }

  useEffect(() => {
    if (term === state.search) return;
    const timer = setTimeout(() => setSearch(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, state.search, setSearch]);

  return (
    <label className="relative flex min-w-56 flex-1 items-center sm:max-w-xs">
      <Search
        className="pointer-events-none absolute left-3 size-4 text-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={t("common.search")}
        className="h-control-sm w-full rounded-md border border-input bg-card pl-9 pr-3 text-body placeholder:text-subtle focus-ring pointer-coarse:h-control-md"
      />
    </label>
  );
}

interface ActiveFilter {
  param: string;
  labelKey: string;
  value: string;
  remove: () => void;
}

/** An option's own text where it has one, its translation otherwise. */
function optionLabel(option: ListFilterOption, t: (key: string) => string): string {
  return option.label ?? t(option.labelKey);
}

/**
 * The chips above the table, derived from the URL rather than passed in.
 *
 * They used to be a prop, and every screen had stopped passing it — a chip
 * hardcoded to a filter nothing applied is a claim the table underneath
 * contradicts. Read from the search parameters, they cannot disagree with what
 * was actually asked for.
 */
function describeFilters(
  state: ListState,
  filters: readonly ListFilter[] | undefined,
  t: (key: string) => string,
): ActiveFilter[] {
  const active: ActiveFilter[] = [];

  if (state.search) {
    active.push({
      param: "search",
      labelKey: "list.searchTerm",
      value: state.search,
      remove: () => state.setSearch(""),
    });
  }

  for (const filter of filters ?? []) {
    const value = state.filters[filter.param];
    if (!value) continue;
    const option = filter.options.find((one) => one.value === value);
    active.push({
      param: filter.param,
      labelKey: filter.labelKey,
      // Falling back to the raw value is deliberate. A chip that cannot name
      // what it is filtering by must still say that something is, or the table
      // underneath is a slice presenting itself as the whole.
      value: option ? optionLabel(option, t) : (filter.formatValue?.(value) ?? value),
      remove: () => state.setFilter(filter.param, null),
    });
  }

  return active;
}

type SelectionState = { mode: "rows"; ids: string[] } | { mode: "filter" };

const NOTHING: SelectionState = { mode: "rows", ids: [] };

function useSelection(ids: string[], total: number, params: ListParams) {
  const [selection, setSelection] = useState<SelectionState>(NOTHING);

  // A selection outlives neither a filter nor a page. Carrying it would mean a
  // bulk action reaching rows the person can no longer see and never meant to
  // include, which is the failure the two selection modes exist to prevent.
  const key = JSON.stringify(params);
  const [appliedKey, setAppliedKey] = useState(key);
  if (appliedKey !== key) {
    setAppliedKey(key);
    setSelection(NOTHING);
  }

  const inFilter = selection.mode === "filter";
  const includes = (id: string) => inFilter || selection.ids.includes(id);
  const allOnPage = ids.length > 0 && ids.every(includes);

  const value: ListSelection = inFilter
    ? { mode: "filter", params, count: total }
    : { mode: "rows", ids: selection.ids, count: selection.ids.length };

  return {
    value,
    includes,
    allOnPage,
    toggleRow: (id: string) =>
      setSelection((current) => {
        // Unticking one row out of "all 4000" cannot be expressed as a filter,
        // so it drops back to this page. The count in the strip falls from 4000
        // to 24 in front of the person doing it — visibly, rather than a bulk
        // action quietly keeping 3976 rows nobody ever looked at.
        if (current.mode === "filter") {
          return { mode: "rows", ids: ids.filter((one) => one !== id) };
        }
        return {
          mode: "rows",
          ids: current.ids.includes(id)
            ? current.ids.filter((one) => one !== id)
            : [...current.ids, id],
        };
      }),
    toggleAll: () => setSelection(allOnPage ? NOTHING : { mode: "rows", ids }),
    selectFilter: () => setSelection({ mode: "filter" }),
    clear: () => setSelection(NOTHING),
  };
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
