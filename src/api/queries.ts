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
 * The most rows one list request will ever return, mirrored from
 * `core/pagination.py`.
 *
 * Its comment there calls the ceiling non-negotiable, and it is: without it a
 * client asking for ten thousand rows turns one request into an outage. It is
 * repeated here because it is also the limit on what a screen can *enumerate* —
 * anything a bulk action wants to act on by id has to fit in one page, or the
 * client is assembling a set it was deliberately never handed.
 */
export const MAX_PAGE_SIZE = 100;

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
    // Same reason as every other list here: the page number is part of the key,
    // so paging is a cache miss, and without this the rows are replaced by a
    // skeleton for the length of a round trip. These two were the only lists
    // missing it, which is why paging buildings and contracts flickered and
    // paging elevators and customers did not.
    placeholderData: (previous) => previous,
  });
}

export function contractListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: relatedKeys.contracts.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Contract>>("/contracts/", { query: params, signal }),
    placeholderData: (previous) => previous,
  });
}

export type ElevatorRow = Schemas["ElevatorList"];
export type Elevator = Schemas["ElevatorDetail"];
export type ElevatorByQr = Schemas["ElevatorByQr"];
export type AuditEntry = Schemas["AuditLog"];
export type Attachment = Schemas["Attachment"];

export const elevatorKeys = {
  all: ["elevators"] as const,
  list: (params: ListParams) => ["elevators", "list", params] as const,
  detail: (id: string) => ["elevators", "detail", id] as const,
  history: (id: string) => ["elevators", "history", id] as const,
  attachments: (id: string) => ["elevators", "attachments", id] as const,
  byQr: (token: string) => ["elevators", "by-qr", token] as const,
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
 * The elevator behind a scanned label.
 *
 * Seven values, not thirty-one. This is the first thing that comes back after a
 * scan, on a phone, on whatever signal a machine room has — so it is deliberately
 * small enough to name the lift before the full record has finished arriving.
 *
 * A token belonging to another firm answers 404, not 403 (spec 11.2). That is a
 * decision the server makes on purpose — a 403 would confirm the sticker is real
 * and let someone map a competitor's estate by trying tokens — and it means the
 * client cannot tell "no such label" from "not your label". Neither can the
 * screen, so it says both.
 */
export function elevatorByQrQuery(token: string) {
  return queryOptions({
    queryKey: elevatorKeys.byQr(token),
    queryFn: ({ signal }) => api.get<ElevatorByQr>(`/elevators/by-qr/${token}/`, { signal }),
    /**
     * The route's loader has already awaited this exact request before the
     * screen mounts, so the default on-mount retry would be a second call for
     * an answer that arrived microseconds ago. Worse than wasteful: while that
     * duplicate is in flight the observer reports `pending` rather than the
     * error it is holding, and the screen shows a spinner instead of the reason
     * the label did not resolve.
     *
     * Nothing goes stale by this. Navigating here again re-runs the loader,
     * which refetches an errored query — so a technician who walks into signal
     * and rescans the same sticker gets a fresh answer, not the cached refusal.
     */
    retryOnMount: false,
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

export const auditLogKeys = {
  all: ["audit-logs"] as const,
  list: (params: ListParams) => ["audit-logs", "list", params] as const,
} as const;

/**
 * The whole trail, narrowed by whatever the URL is asking for.
 *
 * Readable by owners and admins alone (spec 6.2), so every caller gates the
 * request on the role rather than issuing it and swallowing a 403 — the same
 * arrangement `elevatorHistoryQuery` above is under, and for the same reason.
 *
 * `placeholderData` keeps the rows on screen while the next page is fetched.
 * A trail is read by someone comparing one page against the next, and blanking
 * the table on every step makes that harder than it needs to be.
 */
export function auditLogListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: auditLogKeys.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<AuditEntry>>("/audit-logs/", { query: params, signal }),
    placeholderData: (previous) => previous,
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

export type CustomerContactWrite = Schemas["CustomerContactWriteRequest"];

/**
 * Adding a contact to a customer.
 *
 * The customer travels in the body, because that is the only create the server
 * routes. This posted to `/customers/{id}/contacts/` until SL-67, and the
 * contract still declares such a path — but the backend never registered one:
 * `apps/customers/api/v1/urls.py` registers `customers` and `customer-contacts`
 * and nothing else, so every create answered 404.
 *
 * The phantom path is still in `openapi/v1.yaml`, which is why the path linter
 * never objected — it validates calls against that file. The file is
 * checksummed against the backend and can only be corrected by `make sync-spec`
 * in shiftlush-api, so removing it is that repo's task, not a local edit.
 */
export function createCustomerContact(
  customerId: string,
  body: Omit<CustomerContactWrite, "customer">,
  idempotencyKey: string,
) {
  return api.post<CustomerContact>(
    "/customer-contacts/",
    { ...body, customer: customerId },
    { idempotencyKey },
  );
}

export function updateCustomerContact(id: string, body: Partial<CustomerContactWrite>) {
  // An existing contact is addressed by its own id; the customer it belongs to
  // does not change.
  return api.patch<CustomerContact>(`/customer-contacts/${id}/`, body);
}

/**
 * Soft delete, like every delete here: the server marks the row and keeps it,
 * so a contact who signed something last year does not disappear from the
 * record along with the reason anyone can explain it.
 */
export function deleteCustomerContact(id: string) {
  return api.delete<void>(`/customer-contacts/${id}/`);
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

/**
 * `staleTime` and `gcTime` are two different promises, and the cascade needs
 * both.
 *
 * `staleTime: Infinity` says the answer never goes off. `gcTime` says how long
 * an answer nobody is looking at is kept, and its default is five minutes — so
 * closing a building form, spending six minutes on something else, and opening
 * another form drops the eighty-one provinces on the floor and asks for them
 * again. The data is immutable for the life of the session and the key space is
 * bounded (one list of provinces, one list of districts per province), so the
 * right answer is to keep it until the tab closes.
 */
export function provinceQuery() {
  return queryOptions({
    queryKey: ["provinces"] as const,
    queryFn: ({ signal }) => api.get<Province[]>("/provinces/", { signal }),
    // Eighty-one rows that change when a law does. Refetching them per visit
    // is a request that can never return anything new.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function districtQuery(provinceId: number | null) {
  return queryOptions({
    queryKey: ["districts", provinceId] as const,
    queryFn: ({ signal }) =>
      api.get<District[]>("/districts/", { query: { province: provinceId }, signal }),
    enabled: provinceId !== null,
    staleTime: Infinity,
    // Eighty-one possible keys, each a short list. Bounded, so it can be kept.
    gcTime: Infinity,
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
    // The third link of the same immutable cascade, so an answer already held
    // is never worth asking for twice — backspacing over a search term and
    // retyping it should cost nothing.
    staleTime: Infinity,
    // No `gcTime` here, unlike the two above, and the difference is the point:
    // the key includes the search string, so the key space is every prefix
    // anyone types. Keeping those for the life of the session would be a slow
    // leak rather than a cache. The default five minutes is the right ceiling
    // for a set that grows with keystrokes.
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

export type AddElevatorsBody = Schemas["AddElevatorsRequest"];

/**
 * Puts elevators on the contract.
 *
 * A create — it opens a `contract_elevator` row per elevator — so it carries an
 * Idempotency-Key. `unit_price` is a string the whole way: it is money, and the
 * moment it becomes a Number the last two decimal places stop being reliable.
 *
 * Answers with the whole contract rather than the new lines, because adding a
 * line moves the totals too.
 */
export function addContractElevators(
  id: string,
  body: AddElevatorsBody,
  idempotencyKey: string,
) {
  return api.post<Contract>(`/contracts/${id}/elevators/`, body, { idempotencyKey });
}

/**
 * Takes an elevator off the contract. This is not a delete.
 *
 * DELETE is the verb the API chose, but what it does is fill in `removed_at`.
 * Spec 5.12 is explicit that the relation is not deleted when it ends: the date
 * is filled in and the history is kept. The line stays on the contract, because
 * that elevator really was covered until that date and really was invoiced for
 * it — and the partial unique index that allows one active contract per
 * elevator is keyed on `removed_at IS NULL` precisely so that a closed line
 * stops holding the elevator hostage.
 *
 * Named for what it does rather than for its verb, so no caller reads the call
 * site as erasing history.
 */
export function closeContractLine(contractId: string, elevatorId: string) {
  return api.delete<void>(`/contracts/${contractId}/elevators/${elevatorId}/`);
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

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type AttachmentCategory = Schemas["AttachmentCategory"];
export type AttachmentObjectType = Schemas["AttachmentObjectType"];
export type UploadTicket = Schemas["UploadUrlResponse"];

/**
 * Permission to upload one specific file.
 *
 * The ticket is signed for this record, this category, this type and this size.
 * The server reads all of them back off the key when the upload is confirmed,
 * so the two calls cannot be made to disagree — an earlier version took the
 * category from the client twice and could be pointed at the wrong one.
 */
export function requestUploadTicket(body: Schemas["UploadUrlRequestRequest"]) {
  return api.post<UploadTicket>("/attachments/upload-url/", body);
}

/**
 * Telling the server the bytes arrived.
 *
 * Only the key and the name the person will see: everything else is read back
 * from the key and from storage. Carries an idempotency key because a retry
 * after a dropped connection must not produce a second row for one file.
 */
export function confirmUpload(
  body: Schemas["AttachmentConfirmRequest"],
  idempotencyKey: string,
) {
  return api.post<Attachment>("/attachments/", body, { idempotencyKey });
}

/**
 * A URL that works for a few minutes.
 *
 * Fetched at the moment of the click and never stored: the bucket is not
 * public, every read is a fresh signature, and a URL kept in state is a link
 * that works until it quietly does not.
 */
export function attachmentDownloadUrl(id: string) {
  return api.get<Schemas["DownloadUrl"]>(`/attachments/${id}/download-url/`);
}

export function deleteAttachment(id: string) {
  return api.delete<void>(`/attachments/${id}/`);
}

// ---------------------------------------------------------------------------
// QR labels
// ---------------------------------------------------------------------------

/**
 * Sheet geometry, mirrored from `apps/elevators/labels.py`.
 *
 * The server owns the layout; these two numbers exist here only so the screen
 * can say what will happen before it asks. Twelve is what makes "seven cells
 * will be blank" a sentence, and 240 is the ceiling the serializer enforces —
 * a request over it is refused with a validation error, which is a worse way to
 * learn about a limit than a disabled button.
 */
export const LABELS_PER_PAGE = 12;
export const MAX_LABELS = 240;

/**
 * The printable sheet, as the server renders it.
 *
 * A POST rather than a GET, and identifiers in the body rather than the query
 * string: a firm printing five hundred lifts would otherwise build a URL no
 * proxy accepts. The order sent is the order printed, so the sheet can be
 * checked against the list it came from.
 *
 * Deliberately not a query. It is not cacheable by key — the same ids print the
 * same sheet only until a token is regenerated — and it is an action the user
 * takes, not state the screen reads.
 */
export function fetchLabelPdf(elevatorIds: string[], signal?: AbortSignal): Promise<Blob> {
  return api.postFile("/elevators/labels/", { elevator_ids: elevatorIds }, { signal });
}

/**
 * Issues the elevator a new QR token.
 *
 * Destructive in a way the verb does not admit: every label already printed for
 * this lift stops resolving the moment this returns, including the one stuck to
 * the wall. Callers are expected to have asked first.
 */
export function regenerateQr(id: string): Promise<Elevator> {
  return api.post<Elevator>(`/elevators/${id}/regenerate-qr/`);
}

// --------------------------------------------------------------------------
// Complexes
//
// A complex is the layer between a customer and their buildings: the blocks of
// one housing estate, under one management. It is optional — a single
// apartment building has none — which is why every relation to it is nullable.
// --------------------------------------------------------------------------

export type Complex = Schemas["ComplexRead"];
export type ComplexWrite = Schemas["ComplexWriteRequest"];

export const complexKeys = {
  all: ["complexes"] as const,
  list: (params: ListParams) => ["complexes", "list", params] as const,
  detail: (id: string) => ["complexes", "detail", id] as const,
} as const;

export function complexListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: complexKeys.list(params),
    queryFn: ({ signal }) => api.get<Paginated<Complex>>("/complexes/", { query: params, signal }),
    placeholderData: (previous) => previous,
  });
}

export function complexQuery(id: string) {
  return queryOptions({
    queryKey: complexKeys.detail(id),
    queryFn: ({ signal }) => api.get<Complex>(`/complexes/${id}/`, { signal }),
  });
}

export function createComplex(body: ComplexWrite, idempotencyKey: string) {
  return api.post<Complex>("/complexes/", body, { idempotencyKey });
}

export function updateComplex(id: string, body: Partial<ComplexWrite>) {
  return api.patch<Complex>(`/complexes/${id}/`, body);
}

// --------------------------------------------------------------------------
// The team
//
// Two resources, not one. A colleague with an account and an invitation nobody
// has accepted yet live in different tables, and the screens keep them apart
// for the same reason: an invitation has no last login, no certificate and no
// assignments, so folding the two into one list would mean a table where half
// the columns are blank for half the rows — and a result counter that disagrees
// with the number of rows under it, because the two endpoints page separately.
// --------------------------------------------------------------------------

export type TeamUser = Schemas["User"];
export type UserRole = Schemas["UserRole"];
export type UserWrite = Schemas["PatchedUserUpdateRequest"];
export type Invitation = Schemas["Invitation"];
export type InvitationCreate = Schemas["InvitationCreateRequest"];

export const userKeys = {
  all: ["users"] as const,
  list: (params: ListParams) => ["users", "list", params] as const,
  detail: (id: string) => ["users", "detail", id] as const,
} as const;

export const invitationKeys = {
  all: ["invitations"] as const,
  list: (params: ListParams) => ["invitations", "list", params] as const,
} as const;

export function userListQuery(params: ListParams = {}) {
  return queryOptions({
    queryKey: userKeys.list(params),
    queryFn: ({ signal }) => api.get<Paginated<TeamUser>>("/users/", { query: params, signal }),
    placeholderData: (previous) => previous,
  });
}

export function userQuery(id: string) {
  return queryOptions({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) => api.get<TeamUser>(`/users/${id}/`, { signal }),
  });
}

/**
 * How many active owners the company has left.
 *
 * The server refuses to deactivate the last one and refuses to move them to
 * another role, because a company with no owner has nobody who can manage users
 * and no way back short of a database edit. The screen asks for the count so it
 * can say that *before* the control is pressed rather than after.
 *
 * It reads `pagination.total` rather than counting rows: the answer has to be
 * right on page four of a staff list as well as on page one, and a client that
 * counts what it received gets that wrong on every page but the last.
 */
export function activeOwnerCountQuery() {
  const params: ListParams = { role: "owner", is_active: true, page_size: 1 };
  return queryOptions({
    queryKey: userKeys.list(params),
    queryFn: ({ signal }) => api.get<Paginated<TeamUser>>("/users/", { query: params, signal }),
  });
}

/**
 * Invitations, newest first.
 *
 * The endpoint has no "pending" filter, so the narrowing happens in the client.
 * That holds as long as the page is large enough, and it is: the ordering is by
 * creation date descending, so an unaccepted invitation can only fall off the
 * end once a hundred later ones exist.
 */
export function invitationListQuery() {
  const params: ListParams = { page_size: 100 };
  return queryOptions({
    queryKey: invitationKeys.list(params),
    queryFn: ({ signal }) =>
      api.get<Paginated<Invitation>>("/invitations/", { query: params, signal }),
  });
}

/** The ones still waiting on somebody — an accepted invitation is a colleague. */
export function pendingInvitations(page: Paginated<Invitation> | undefined): Invitation[] {
  return (page?.results ?? []).filter((invitation) => invitation.accepted_at === null);
}

/**
 * Sending an invitation.
 *
 * Carries an Idempotency-Key like every other create, and it matters more here
 * than most: a retry after a dropped connection would otherwise send a second
 * e-mail whose token invalidates the first, so the link the invitee had already
 * opened stops working while they are looking at it.
 */
export function inviteUser(body: InvitationCreate, idempotencyKey: string) {
  return api.post<Invitation>("/invitations/", body, { idempotencyKey });
}

export function resendInvitation(id: string) {
  return api.post<Invitation>(`/invitations/${id}/resend/`);
}

/** Revoking one: the row is soft-deleted and the token stops resolving. */
export function revokeInvitation(id: string) {
  return api.delete<void>(`/invitations/${id}/`);
}

export function updateUser(id: string, body: UserWrite) {
  return api.patch<TeamUser>(`/users/${id}/`, body);
}

/**
 * Ending somebody's access.
 *
 * A leaver is deactivated rather than deleted, because their audit trail has to
 * outlive their employment. There is no endpoint to undo it and PATCH does not
 * accept `is_active`, so the confirmation says the step is one-way instead of
 * implying an undo that does not exist.
 */
export function deactivateUser(id: string) {
  return api.post<TeamUser>(`/users/${id}/deactivate/`);
}

/**
 * Replacing the set of customers a technician may see.
 *
 * A PUT of the whole list, which is the server's own shape: it is the only form
 * that can remove an assignment without a second endpoint, and it means two
 * administrators saving at once cannot interleave into a set neither of them
 * chose. Sending it for anyone but a technician is refused —
 * `ONLY_TECHNICIANS_ARE_ASSIGNED` — since every other role sees the whole firm.
 */
export function setAssignedCustomers(id: string, customerIds: string[]) {
  return api.put<TeamUser>(`/users/${id}/customers/`, { customer_ids: customerIds });
}

/**
 * Soft delete, and refused while the complex still holds buildings.
 *
 * The server raises RECORD_IN_USE rather than orphaning the blocks or taking
 * them down with it, so the caller has to be ready for a refusal even when the
 * count it is looking at says zero — that count was read when the page loaded.
 */
export function deleteComplex(id: string) {
  return api.delete<void>(`/complexes/${id}/`);
}

// ---------------------------------------------------------------------------
// The firm itself, and the person signed in
// ---------------------------------------------------------------------------

export type Company = Schemas["Company"];
export type CompanyWrite = Schemas["PatchedCompanyRequest"];
export type CurrentUser = Schemas["CurrentUser"];

export const companyKeys = {
  all: ["company"] as const,
  record: ["company", "record"] as const,
  logos: ["company", "logos"] as const,
} as const;

/**
 * The one company this session belongs to.
 *
 * There is no id in the path, and that is the point: the tenant comes from the
 * token. An endpoint that took an id would be an endpoint that could be pointed
 * at somebody else's firm, and the server would then have to prove on every
 * call that it was not.
 *
 * No trailing slash either. This is not a router resource and the contract
 * spells it without one — see the note at the top of this file for why that
 * distinction is load-bearing rather than cosmetic.
 */
export function companyQuery() {
  return queryOptions({
    queryKey: companyKeys.record,
    queryFn: ({ signal }) => api.get<Company>("/company", { signal }),
  });
}

/**
 * PATCH, and no create: a company is made once, by registration.
 *
 * Carries no Idempotency-Key. The header is for calls that create a record,
 * where a retry after a dropped connection would make a second one; this one
 * updates a row that already exists, so replaying it lands on the same values.
 */
export function updateCompany(body: CompanyWrite) {
  return api.patch<Company>("/company", body);
}

/**
 * Every logo the firm has uploaded, not just the current one.
 *
 * `company.logo` is a foreign key to one of these — see spec 5.13: the
 * polymorphic link says a file belongs to this company, the key says which of
 * them is in force today. Keeping the others means replacing a logo is an
 * upload rather than an overwrite, and the one it replaced is still there when
 * somebody wants it back.
 */
export function companyLogoQuery(companyId: string) {
  return queryOptions({
    queryKey: companyKeys.logos,
    queryFn: ({ signal }) =>
      api.get<Paginated<Attachment>>("/attachments/", {
        query: {
          object_type: "company",
          object_id: companyId,
          category: "logo",
          page_size: 20,
        },
        signal,
      }),
  });
}

/**
 * Who is signed in, from the server rather than from the session context.
 *
 * The context carries what every screen needs on every page — name, role,
 * company — and deliberately not the address or the phone number. This screen
 * shows both, so it asks the endpoint that owns them.
 */
export function currentUserQuery() {
  return queryOptions({
    queryKey: ["auth", "me"] as const,
    queryFn: ({ signal }) => api.get<CurrentUser>("/auth/me", { signal }),
  });
}

// --------------------------------------------------------------------------
// The signed-in person's own access
//
// Every request here is scoped to the caller by the token and takes no user
// id at all. There is no way to ask for somebody else's sessions, and no
// screen should be built as though there were: a session list says which
// devices a person carries and when they last held one, which is theirs to
// read and nobody else's.
// --------------------------------------------------------------------------

/**
 * One signed-in device.
 *
 * Named apart from the `Session` in `lib/session`, which is this application's
 * own idea of "who is signed in here". This one is a row on the server: one per
 * sign-in, surviving every refresh-token rotation in between, which is why `id`
 * stays revocable for as long as the device is signed in.
 */
export type AuthSession = Schemas["Session"];

export const sessionKeys = {
  all: ["auth", "sessions"] as const,
};

export function sessionListQuery() {
  return queryOptions({
    queryKey: sessionKeys.all,
    queryFn: ({ signal }) => api.get<AuthSession[]>("/auth/sessions", { signal }),
    // Zero, against the client's thirty-second default. That default is right
    // for operational data two colleagues are reading at once; this is a
    // security screen somebody opens *because* they want to know what is open
    // now, and half a minute of a revoked device still being listed is the one
    // answer it must never give.
    staleTime: 0,
  });
}

/**
 * Changing the password from inside a session.
 *
 * Answers with the same `TokenResponse` sign-in does, and that is not a
 * formality: the change ends every session on the account and re-opens the
 * caller's on a new refresh cookie and a new access token. A caller that drops
 * the response signs itself out on success. See `adoptTokens` in lib/session.
 */
export function changePassword(currentPassword: string, newPassword: string) {
  return api.post<TokenResponse>("/auth/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/** Ends one session. The caller's own survives unless it is the one named. */
export function revokeSession(sessionId: string) {
  return api.delete<void>(`/auth/sessions/${sessionId}`);
}

/** Ends every session but the caller's, which is kept by the server. */
export function revokeOtherSessions() {
  return api.post<void>("/auth/sessions/revoke-others");
}
