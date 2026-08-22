/**
 * Query keys and the requests behind them.
 *
 * Keys live in one place because invalidation depends on them agreeing. A key
 * spelled inline at a call site cannot be invalidated from anywhere else, and
 * the failure is silent: the mutation succeeds, the list keeps showing the old
 * row, and nobody can reproduce it because a reload fixes it.
 *
 * Every list here returns the server's own paging envelope rather than a bare
 * array. The screen needs the total to render the result count and to size the
 * pager, and a client that counts the rows it received gets that wrong on every
 * page but the last.
 */
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { components } from "@/api/generated";

type Schemas = components["schemas"];

/**
 * The server's paging envelope, and the reason it is written out rather than
 * inferred: the contract described DRF's default `{count, next, previous}` for
 * months while the server sent this. See SL-27.
 */
export interface Paginated<T> {
  results: T[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
}

export type Customer = Schemas["CustomerRead"];
export type CustomerContact = Schemas["CustomerContactRead"];

/**
 * Anything a list endpoint accepts as a query string.
 *
 * Loose on purpose: every resource adds its own filters (`status`, `customer`,
 * `role`) and enumerating them here would mean editing this file for each one,
 * which is exactly the friction that makes people inline a key instead.
 */
export type ListParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Keys are hierarchical so a broad invalidation reaches the narrow ones:
 * invalidating `customers.all` clears every list *and* every detail, which is
 * what you want after a delete.
 */
export const keys = {
  customers: {
    all: ["customers"] as const,
    list: (params: ListParams) => ["customers", "list", params] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
  },
} as const;

export function customerListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: keys.customers.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Customer>>("/customers", { query: params, signal }),
    // The previous page stays on screen while the next one loads, so paging
    // does not blank the table and jump the scroll position.
    placeholderData: (previous) => previous,
  });
}

export function customerQuery(id: string) {
  return queryOptions({
    queryKey: keys.customers.detail(id),
    queryFn: ({ signal }) => api.get<Customer>(`/customers/${id}`, { signal }),
  });
}

/**
 * The contact a screen should show when it has room for one.
 *
 * The API returns every contact; picking here rather than in each screen means
 * the list and the detail page cannot disagree about who the primary is.
 */
export function primaryContact(customer: Pick<Customer, "contacts">): CustomerContact | null {
  const contacts = customer.contacts ?? [];
  return contacts.find((contact) => contact.is_primary) ?? contacts[0] ?? null;
}

export type Building = Schemas["BuildingRead"];
export type Contract = Schemas["ContractRead"];

/**
 * The buildings and contracts hanging off one customer.
 *
 * Defined here rather than on the customer detail screen because the customer
 * page is not their owner — the building and contract screens will use the same
 * keys, and two spellings of the same key means an edit on one page leaves the
 * other showing a stale row.
 */
export const relatedKeys = {
  buildings: {
    all: ["buildings"] as const,
    list: (params: ListParams) => ["buildings", "list", params] as const,
  },
  contracts: {
    all: ["contracts"] as const,
    list: (params: ListParams) => ["contracts", "list", params] as const,
  },
} as const;

export function buildingListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: relatedKeys.buildings.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Building>>("/buildings", { query: params, signal }),
  });
}

export function contractListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: relatedKeys.contracts.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Contract>>("/contracts", { query: params, signal }),
  });
}

export type ElevatorRow = Schemas["ElevatorList"];
export type Elevator = Schemas["ElevatorDetail"];
export type AuditEntry = Schemas["AuditLog"];
export type Attachment = Schemas["Attachment"];

export const elevatorKeys = {
  all: ["elevators"] as const,
  list: (params: ListParams) => ["elevators", "list", params] as const,
  detail: (id: string) => ["elevators", "detail", id] as const,
  history: (id: string) => ["elevators", "history", id] as const,
  attachments: (id: string) => ["elevators", "attachments", id] as const,
} as const;

export function elevatorListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: elevatorKeys.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<ElevatorRow>>("/elevators", { query: params, signal }),
    placeholderData: (previous) => previous,
  });
}

export function elevatorQuery(id: string) {
  return queryOptions({
    queryKey: elevatorKeys.detail(id),
    queryFn: ({ signal }) => api.get<Elevator>(`/elevators/${id}`, { signal }),
  });
}

/**
 * What happened to this elevator, from the audit trail.
 *
 * There is no history endpoint on the elevator itself, and there should not be:
 * the trail is one table with one shape, and a per-resource view of it would be
 * a second thing to keep in step. Only owners and admins may read it, so the
 * screen asks for it conditionally rather than swallowing a 403 on every visit.
 */
export function elevatorHistoryQuery(id: string) {
  return queryOptions({
    queryKey: elevatorKeys.history(id),
    queryFn: ({ signal }) =>
      api.get<Paginated<AuditEntry>>("/audit-logs", {
        query: { table_name: "elevator", record_id: id, page_size: 20 },
        signal,
      }),
  });
}

export function elevatorAttachmentsQuery(id: string) {
  return queryOptions({
    queryKey: elevatorKeys.attachments(id),
    queryFn: ({ signal }) =>
      api.get<Paginated<Attachment>>("/attachments", {
        query: { object_type: "elevator", object_id: id, page_size: 50 },
        signal,
      }),
  });
}
