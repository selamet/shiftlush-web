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
// Router endpoints carry a trailing slash and the auth endpoints do not — that
// is what the contract declares, and it is not cosmetic. Django's APPEND_SLASH
// answers a slashless POST with a 301, and a browser turns a redirected POST
// into a GET: the write silently becomes a read and the body is dropped.
// `scripts/check-api-paths.mjs` checks every literal here against the contract.
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
      api.get<Paginated<Customer>>("/customers/", { query: params, signal }),
    // The previous page stays on screen while the next one loads, so paging
    // does not blank the table and jump the scroll position.
    placeholderData: (previous) => previous,
  });
}

export function customerQuery(id: string) {
  return queryOptions({
    queryKey: keys.customers.detail(id),
    queryFn: ({ signal }) => api.get<Customer>(`/customers/${id}/`, { signal }),
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
      api.get<Paginated<Building>>("/buildings/", { query: params, signal }),
  });
}

export function contractListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: relatedKeys.contracts.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Contract>>("/contracts/", { query: params, signal }),
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
      api.get<Paginated<ElevatorRow>>("/elevators/", { query: params, signal }),
    placeholderData: (previous) => previous,
  });
}

export function elevatorQuery(id: string) {
  return queryOptions({
    queryKey: elevatorKeys.detail(id),
    queryFn: ({ signal }) => api.get<Elevator>(`/elevators/${id}/`, { signal }),
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
      api.get<Paginated<AuditEntry>>("/audit-logs/", {
        query: { table_name: "elevator", record_id: id, page_size: 20 },
        signal,
      }),
  });
}

export function elevatorAttachmentsQuery(id: string) {
  return queryOptions({
    queryKey: elevatorKeys.attachments(id),
    queryFn: ({ signal }) =>
      api.get<Paginated<Attachment>>("/attachments/", {
        query: { object_type: "elevator", object_id: id, page_size: 50 },
        signal,
      }),
  });
}

export type CustomerWrite = Schemas["CustomerWriteRequest"];

/**
 * Creating and updating a customer.
 *
 * The create carries an Idempotency-Key. The server stores the response against
 * it for a day and replays it, so a retry after a dropped connection returns
 * the record that was already made rather than making a second one.
 */
export function createCustomer(body: CustomerWrite, idempotencyKey: string) {
  return api.post<Customer>("/customers/", body, { idempotencyKey });
}

export function updateCustomer(id: string, body: Partial<CustomerWrite>) {
  // PATCH, not PUT: the API does not route a full replace, because it means the
  // client must send every field it does not want cleared — and the day the
  // model grows a column, old clients start wiping it.
  return api.patch<Customer>(`/customers/${id}/`, body);
}

// --------------------------------------------------------------------------
// Public authentication flows
//
// None of these carry a token: the caller has no session yet, which is the
// point of every one of them.
// --------------------------------------------------------------------------

export type TokenResponse = Schemas["TokenResponse"];
export type InvitationPreview = Schemas["InvitationPreview"];

export function registerCompany(body: Schemas["RegisterRequest"], idempotencyKey: string) {
  return api.post<TokenResponse>("/auth/register", body, { anonymous: true, idempotencyKey });
}

export function requestPasswordReset(email: string) {
  return api.post<void>("/auth/password-reset", { email }, { anonymous: true });
}

export function confirmPasswordReset(token: string, password: string) {
  return api.post<void>("/auth/password-reset/confirm", { token, password }, { anonymous: true });
}

export function verifyEmail(token: string) {
  return api.post<void>("/auth/email/verify", { token }, { anonymous: true });
}

export function resendVerification() {
  // The one call here that does need a session: it re-sends to the address of
  // whoever is signed in, which is why it takes no address at all.
  return api.post<void>("/auth/email/resend");
}

export function invitationPreviewQuery(token: string) {
  return queryOptions({
    queryKey: ["invitation", token] as const,
    queryFn: ({ signal }) =>
      api.get<InvitationPreview>(`/invitations/verify/${token}`, { anonymous: true, signal }),
    // A bad or expired token is a final answer, not a transient failure.
    retry: false,
  });
}

export function acceptInvitation(token: string, password: string) {
  return api.post<TokenResponse>(
    "/invitations/accept",
    { token, password },
    { anonymous: true },
  );
}

// --------------------------------------------------------------------------
// Address
//
// A chain, and each link is required by the server rather than merely
// suggested: districts refuse to answer without a province, neighbourhoods
// without a district and two characters of search. Fifty thousand
// neighbourhoods are never served whole, so there is no version of this the
// client can shortcut.
// --------------------------------------------------------------------------

export type Province = Schemas["Province"];
export type District = Schemas["District"];
export type Neighborhood = Schemas["Neighborhood"];

export function provinceQuery() {
  return queryOptions({
    queryKey: ["provinces"] as const,
    queryFn: ({ signal }) => api.get<Province[]>("/provinces/", { signal }),
    // Eighty-one rows that change when a law does. Refetching them per visit
    // is a request that can never return anything new.
    staleTime: Infinity,
  });
}

export function districtQuery(provinceId: number | null) {
  return queryOptions({
    queryKey: ["districts", provinceId] as const,
    queryFn: ({ signal }) =>
      api.get<District[]>("/districts/", { query: { province: provinceId }, signal }),
    enabled: provinceId !== null,
    staleTime: Infinity,
  });
}

export function neighborhoodQuery(districtId: number | null, search: string) {
  return queryOptions({
    queryKey: ["neighborhoods", districtId, search] as const,
    queryFn: ({ signal }) =>
      api.get<Neighborhood[]>("/neighborhoods/", {
        query: { district: districtId, search },
        signal,
      }),
    // The server wants two characters; asking with fewer returns nothing and
    // spends a request to find that out.
    enabled: districtId !== null && search.trim().length >= 2,
  });
}

// --------------------------------------------------------------------------
// Buildings
// --------------------------------------------------------------------------

export type BuildingWrite = Schemas["BuildingWriteRequest"];

export const buildingKeys = {
  all: ["buildings"] as const,
  detail: (id: string) => ["buildings", "detail", id] as const,
} as const;

export function buildingQuery(id: string) {
  return queryOptions({
    queryKey: buildingKeys.detail(id),
    queryFn: ({ signal }) => api.get<Building>(`/buildings/${id}/`, { signal }),
  });
}

export function createBuilding(body: BuildingWrite, idempotencyKey: string) {
  return api.post<Building>("/buildings/", body, { idempotencyKey });
}

export function updateBuilding(id: string, body: Partial<BuildingWrite>) {
  return api.patch<Building>(`/buildings/${id}/`, body);
}

export type ElevatorWrite = Schemas["ElevatorWriteRequest"];

export function createElevator(body: ElevatorWrite, idempotencyKey: string) {
  return api.post<Elevator>("/elevators/", body, { idempotencyKey });
}

export function updateElevator(id: string, body: Partial<ElevatorWrite>) {
  return api.patch<Elevator>(`/elevators/${id}/`, body);
}

// --------------------------------------------------------------------------
// Contracts
// --------------------------------------------------------------------------

export type ContractWrite = Schemas["ContractWriteRequest"];
export type ContractLine = Schemas["ContractLine"];

export const contractKeys = {
  all: ["contracts"] as const,
  detail: (id: string) => ["contracts", "detail", id] as const,
} as const;

export function contractQuery(id: string) {
  return queryOptions({
    queryKey: contractKeys.detail(id),
    queryFn: ({ signal }) => api.get<Contract>(`/contracts/${id}/`, { signal }),
  });
}

export function createContract(body: ContractWrite, idempotencyKey: string) {
  return api.post<Contract>("/contracts/", body, { idempotencyKey });
}

export function updateContract(id: string, body: Partial<ContractWrite>) {
  return api.patch<Contract>(`/contracts/${id}/`, body);
}

/**
 * Ending a contract early.
 *
 * Its own endpoint rather than a status field, because it touches three tables:
 * the contract, its lines, and every elevator that falls back to uncontracted.
 * A client sending `status: "terminated"` would be taking responsibility for
 * side effects it cannot perform.
 */
export function terminateContract(id: string, terminatedAt: string, reason: string) {
  return api.post<Contract>(`/contracts/${id}/terminate/`, {
    terminated_at: terminatedAt,
    reason,
  });
}

export function renewContract(id: string, body: { start_date: string; end_date: string }) {
  return api.post<Contract>(`/contracts/${id}/renew/`, body);
}

/** Lines grouped by the building they are in, which is how the screen reads them. */
export function linesByBuilding(contract: Pick<Contract, "lines">): Map<string, ContractLine[]> {
  const grouped = new Map<string, ContractLine[]>();
  for (const line of contract.lines ?? []) {
    const key = line.building_name || "";
    grouped.set(key, [...(grouped.get(key) ?? []), line]);
  }
  return grouped;
}
