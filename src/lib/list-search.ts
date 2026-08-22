import { useCallback } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ListParams } from "@/api/queries";

/**
 * The filter, search and paging state of a list screen, carried in the URL.
 *
 * Spec 13: every list screen's filter/paging/sorting state travels in the
 * address bar, validated through TanStack Router's `validateSearch`. Three
 * things fall out of holding it in component state instead, and all three were
 * true of every list in this product until this module existed: a filtered list
 * cannot be sent to a colleague, a refresh throws the filter away, and the back
 * button skips past the filter to the previous screen.
 *
 * The names in the URL are the names the API takes — `page`, `page_size`,
 * `search`, `ordering`, `status`, `is_active`. There is no translation layer
 * between the address bar and the request, so there is no translation layer to
 * get wrong, and a support request can be answered by reading the URL.
 */

/** A value the filter offers, spelled the way the contract spells it. */
export interface ListFilterOption {
  value: string;
  labelKey: string;
}

export interface ListFilter {
  /** Query-string key, and the API query parameter of the same name. */
  param: string;
  labelKey: string;
  /**
   * Everything the API accepts for this parameter. Also the whitelist: a value
   * outside this set is dropped from the URL rather than forwarded, so a
   * hand-edited address shows an unfiltered list instead of a 400.
   */
  options: readonly ListFilterOption[];
}

/**
 * The validated search of a list route.
 *
 * Only what is set is present. A default that is written out — `?page=1` — is
 * noise in a URL meant to be copied into a chat message, and it makes two URLs
 * for the same screen.
 */
export interface ListSearch {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  /** Filter values, keyed by `ListFilter.param`. */
  [param: string]: string | number | undefined;
}

export const DEFAULT_PAGE_SIZE = 25;

/** The sizes the pager offers. Anything else in the URL falls back to the default. */
export const PAGE_SIZES = [25, 50, 100] as const;

/**
 * A filter over an API enum. The option labels come from the namespace the
 * enum already has, so a value the API adds needs a translation and nothing
 * else.
 */
export function enumFilter({
  param,
  labelKey,
  namespace,
  values,
}: {
  param: string;
  labelKey: string;
  namespace: string;
  values: readonly string[];
}): ListFilter {
  return {
    param,
    labelKey,
    options: values.map((value) => ({ value, labelKey: `${namespace}.${value}` })),
  };
}

/** A filter over a flag the API takes as `true` or `false`. */
export function booleanFilter({
  param,
  labelKey,
}: {
  param: string;
  labelKey: string;
}): ListFilter {
  return {
    param,
    labelKey,
    options: [
      { value: "true", labelKey: "common.yes" },
      { value: "false", labelKey: "common.no" },
    ],
  };
}

function positiveInt(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Narrows a raw search to what this list may ask for.
 *
 * Everything unrecognised is discarded, defaults included: a stale link naming
 * a filter that has since been removed, a value someone typed into the address
 * bar, `?page=-4`. All of them degrade to an unfiltered first page instead of
 * being forwarded to an endpoint that would answer 400.
 */
function narrow(raw: Record<string, unknown>, filters: readonly ListFilter[]): ListSearch {
  const search: ListSearch = {};

  const page = positiveInt(raw.page);
  if (page !== undefined && page > 1) search.page = page;

  const size = positiveInt(raw.page_size);
  const offered = (PAGE_SIZES as readonly number[]).includes(size ?? 0);
  if (size !== undefined && size !== DEFAULT_PAGE_SIZE && offered) search.page_size = size;

  const term = text(raw.search);
  if (term) search.search = term;

  const ordering = text(raw.ordering);
  if (ordering) search.ordering = ordering;

  for (const filter of filters) {
    const value = text(raw[filter.param]);
    if (value && filter.options.some((option) => option.value === value)) {
      search[filter.param] = value;
    }
  }

  return search;
}

export interface ListSearchSchema {
  /** The route's `validateSearch`. */
  (raw: Record<string, unknown>): ListSearch;
  /**
   * The API query for a raw search, narrowed on the way.
   *
   * Narrowed again here rather than trusted: a route that declares
   * `validateSearch` still inherits whatever its parents passed through, so
   * what a route match holds is its own validated search *plus* every
   * unrecognised parameter that was in the URL. Forwarding that to the API is
   * how `?status=banana` becomes a 400 nobody can explain.
   */
  params: (raw: Record<string, unknown>) => ListParams;
}

/** Builds the `validateSearch` for one list route, and the query behind it. */
export function listSearchSchema(filters: readonly ListFilter[] = NO_FILTERS): ListSearchSchema {
  const schema = ((raw: Record<string, unknown>) => narrow(raw, filters)) as ListSearchSchema;
  schema.params = (raw) => listParams(narrow(raw, filters));
  return schema;
}

/**
 * The API query for a validated search.
 *
 * Used by the screen and by the route loader both, so a link opened with a
 * filter on it prefetches the list the visitor asked for rather than warming
 * page one and then fetching again.
 */
export function listParams(search: ListSearch = {}): ListParams {
  const params: ListParams = {
    page: search.page ?? 1,
    page_size: search.page_size ?? DEFAULT_PAGE_SIZE,
  };
  for (const [key, value] of Object.entries(search)) {
    if (key === "page" || key === "page_size") continue;
    if (typeof value === "string" && value) params[key] = value;
  }
  return params;
}

export interface ListState {
  page: number;
  pageSize: number;
  /** The free-text term, or "" when none is set. */
  search: string;
  /** Only the filters that are set, keyed by param. */
  filters: Record<string, string>;
  /** What to ask the API for. */
  params: ListParams;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSearch: (term: string) => void;
  /** `null` removes the filter. */
  setFilter: (param: string, value: string | null) => void;
  /**
   * Drops every filter and the search term, and returns to the first page.
   * Page size and sorting are not filters and stay as they were.
   */
  clearAll: () => void;
}

const NO_FILTERS: readonly ListFilter[] = [];

/**
 * Reads this route's list state and writes changes back to the URL.
 *
 * The screen owns the filter definitions because the screen is what knows its
 * endpoint; this hook needs them to tell a filter parameter from a paging one,
 * and to know which values are real.
 *
 * `navigate` is used untyped on purpose. It is typed per route against that
 * route's own `validateSearch`, and this hook is deliberately route-agnostic —
 * the validation that makes the search typed happens on the route, which is
 * where the spec puts it.
 */
export function useListSearch(filters: readonly ListFilter[] = NO_FILTERS): ListState {
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  const update = useCallback(
    (patch: Record<string, unknown>, replace = false) => {
      void (navigate as unknown as NavigateWithSearch)({
        // Narrowed on the way out as well as on the way in, so the address bar
        // ends up holding exactly the parameters this list understands and a
        // default never has to be written out to be re-read.
        search: (previous: Record<string, unknown>) => narrow({ ...previous, ...patch }, filters),
        replace,
      });
    },
    [navigate, filters],
  );

  const search = narrow(raw, filters);
  const values: Record<string, string> = {};
  for (const filter of filters) {
    const value = search[filter.param];
    if (typeof value === "string") values[filter.param] = value;
  }

  return {
    page: search.page ?? 1,
    pageSize: search.page_size ?? DEFAULT_PAGE_SIZE,
    search: search.search ?? "",
    filters: values,
    params: listParams(search),
    setPage: useCallback((page: number) => update({ page }), [update]),
    // Back to the first page: staying on page four of a 25-row list after
    // switching to 100 per page lands past the end and shows nothing. The same
    // reasoning applies to every narrowing below.
    setPageSize: useCallback((size: number) => update({ page_size: size, page: 1 }), [update]),
    // Typing replaces rather than pushes: one history entry per keystroke would
    // turn the back button into a way of spelling the word backwards. Clearing
    // the term is a decision rather than a keystroke, so that one is pushed and
    // the back button puts the search back.
    setSearch: useCallback(
      (term: string) => update({ search: term.trim(), page: 1 }, term.trim() !== ""),
      [update],
    ),
    setFilter: useCallback(
      (param: string, value: string | null) => update({ [param]: value ?? undefined, page: 1 }),
      [update],
    ),
    clearAll: useCallback(() => {
      const cleared: Record<string, unknown> = { search: undefined, page: 1 };
      for (const filter of filters) cleared[filter.param] = undefined;
      update(cleared);
    }, [update, filters]),
  };
}

type NavigateWithSearch = (options: {
  search: (previous: Record<string, unknown>) => Record<string, unknown>;
  replace?: boolean;
}) => Promise<void>;
