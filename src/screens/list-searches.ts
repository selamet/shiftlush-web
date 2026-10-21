/**
 * The filter definitions and search schemas of every list route.
 *
 * These live apart from the screens that use them because the router needs them
 * and the screens are lazy. A route declares `validateSearch` and `loaderDeps`
 * at module scope — that is what makes a list's paging and filter parameters
 * typed, and what lets the loader prefetch the page the link actually names —
 * so the schema has to be reachable while the route tree is being built, which
 * is before any screen has been asked for. Left on the screen modules, one
 * import of `elevatorListSearch` dragged `ElevatorListScreen` and everything it
 * renders back into the entry chunk, and the lazy boundary bought nothing.
 *
 * What is here is the answer to "what may be in the URL", not "what does the
 * page look like": a few hundred bytes of parameter names and accepted values
 * per list, which every visitor downloads because every visitor may follow a
 * link carrying one. The screen is what they may never open.
 *
 * The screens import their own `filters` back from here, so the array the route
 * validates against and the array the filter bar renders are the same object
 * rather than two lists that can drift apart.
 */
import {
  booleanFilter,
  dateFilter,
  enumFilter,
  idMenuFilter,
  listSearchSchema,
  scopeFilter,
  type ListFilter,
} from "@/lib/list-search";
import { monthYearLabel, todayIso } from "@/lib/date";
import { isPeriod, periodOf } from "@/lib/plan";

/**
 * What `GET /elevators/` narrows by, spelled the way the contract spells it.
 *
 * Building and customer are absent on purpose. Both are references to a set
 * that runs to thousands, so they need the searchable picker rather than a menu
 * listing every building the firm has — and an empty menu would be the same
 * dead control in a new shape.
 */
export const elevatorFilters = [
  enumFilter({
    param: "status",
    labelKey: "elevator.fields.status",
    namespace: "elevator.status",
    values: ["active", "suspended", "sealed", "out_of_service", "uncontracted"],
  }),
  enumFilter({
    param: "inspection_label",
    labelKey: "elevator.fields.inspectionLabel",
    namespace: "elevator.inspectionLabel",
    values: ["green", "blue", "yellow", "red", "none"],
  }),
  enumFilter({
    param: "category",
    labelKey: "elevator.fields.category",
    namespace: "elevator.category",
    values: [
      "passenger",
      "freight",
      "passenger_freight",
      "dumbwaiter",
      "accessibility_platform",
      "vehicle",
    ],
  }),
];

/** Bound to the route, so the search parameters arrive typed and validated. */
export const elevatorListSearch = listSearchSchema(elevatorFilters);

export const customerFilters = [
  enumFilter({
    param: "type",
    labelKey: "customer.fields.type",
    namespace: "customer.type",
    values: ["complex_management", "building_management", "corporate", "public", "individual"],
  }),
  booleanFilter({ param: "is_active", labelKey: "customer.fields.isActive" }),
];

export const customerListSearch = listSearchSchema(customerFilters);

/**
 * Paging only. `GET /complexes/` declares no `search` and no filter beyond
 * `customer`, which is a reference rather than a menu — so this list offers
 * neither, instead of offering both and narrowing nothing.
 */
export const complexListSearch = listSearchSchema();

export const buildingFilters = [
  enumFilter({
    param: "type",
    labelKey: "building.fields.type",
    namespace: "building.type",
    values: [
      "residential",
      "commercial",
      "mixed_use",
      "public",
      "hospital",
      "mall",
      "hotel",
      "school",
      "industrial",
    ],
  }),
  booleanFilter({ param: "is_active", labelKey: "building.fields.isActive" }),
];

export const buildingListSearch = listSearchSchema(buildingFilters);

export const contractFilters = [
  enumFilter({
    param: "status",
    labelKey: "contract.fields.status",
    namespace: "contract.status",
    values: ["draft", "active", "expired", "terminated", "renewed"],
  }),
  enumFilter({
    param: "scope",
    labelKey: "contract.fields.scope",
    namespace: "contract.scope",
    values: ["maintenance_only", "maintenance_and_repair", "full_coverage"],
  }),
];

export const contractListSearch = listSearchSchema(contractFilters);

/** `GET /users/` declares no `search`, so this list is not offered one. */
export const userFilters = [
  enumFilter({
    param: "role",
    labelKey: "user.fields.role",
    namespace: "user.role",
    values: ["owner", "admin", "operations", "technician", "accountant"],
  }),
  booleanFilter({ param: "is_active", labelKey: "user.fields.isActive" }),
];

export const userListSearch = listSearchSchema(userFilters);

/**
 * Named after the parameters `GET /audit-logs/` declares, so what is in the
 * address bar and what is in the request are the same list of names.
 *
 * All six the endpoint offers are here. A trail is opened when something has
 * gone wrong and someone is working out what happened, and the questions they
 * arrive with are which record, who, what kind of change, and when — so a
 * filter that exists on the endpoint and not on the screen is a question that
 * has to be answered by scrolling.
 *
 * `user_id` and `record_id` take ids rather than a fixed set of values, so
 * neither can list its options here: this module is evaluated when the router
 * is built, long before a colleague list has been fetched. They narrow on the
 * shape of an id instead, and the actor menu is handed its options on screen.
 */
export const auditLogFilters: ListFilter[] = [
  enumFilter({
    param: "table_name",
    labelKey: "auditLog.fields.tableName",
    namespace: "auditLog.table",
    values: [
      "elevator",
      "building",
      "complex",
      "customer",
      "customer_contact",
      "contract",
      "contract_elevator",
      "user",
      "company",
      "attachment",
    ],
  }),
  enumFilter({
    param: "action",
    labelKey: "auditLog.fields.action",
    namespace: "auditLog.action",
    values: ["create", "update", "delete"],
  }),
  idMenuFilter({ param: "user_id", labelKey: "auditLog.fields.actor" }),
  dateFilter({ param: "since", labelKey: "auditLog.fields.since" }),
  dateFilter({ param: "until", labelKey: "auditLog.fields.until" }),
  // Arrives on a link — "view all history" on a record's own screen — rather
  // than being picked here. Shown as a chip so a list narrowed to one lift
  // never reads as the firm's whole trail.
  scopeFilter({ param: "record_id", labelKey: "auditLog.recordScope" }),
];

export const auditLogListSearch = listSearchSchema(auditLogFilters);

/**
 * What `GET /maintenance-visits/` narrows by.
 *
 * `technician` is a colleague's id, so its menu is handed its options on
 * screen like the audit trail's actor. `elevator` arrives on a link — "all
 * visits" under an elevator's history panel — and is shown as a chip, so a
 * list narrowed to one lift never reads as the firm's whole register.
 *
 * The two days are inclusive on the server, and they are plain calendar days
 * on both sides — `visit_date` is a date, not a timestamp — so unlike the audit
 * trail's `until` there is no end-of-day to add on the way out.
 *
 * `customer` is left out for the reason building and customer are left off the
 * elevator list — a reference into thousands needs a searchable picker, not a
 * menu.
 */
export const visitFilters: ListFilter[] = [
  enumFilter({
    param: "status",
    labelKey: "visit.fields.status",
    namespace: "visit.status",
    values: ["completed", "incomplete", "access_denied"],
  }),
  idMenuFilter({ param: "technician", labelKey: "visit.fields.technician" }),
  dateFilter({ param: "visit_date_after", labelKey: "visit.fields.visitDateAfter" }),
  dateFilter({ param: "visit_date_before", labelKey: "visit.fields.visitDateBefore" }),
  scopeFilter({ param: "elevator", labelKey: "visit.elevatorScope" }),
];

export const visitListSearch = listSearchSchema(visitFilters);

/**
 * The list's request, newest visit first unless the URL says otherwise.
 *
 * One function for the route's prefetch and the screen's query, so the two ask
 * for the same key — a default added in one place and not the other would
 * warm a cache entry the screen never reads.
 */
export function visitListParams(raw: Record<string, unknown>) {
  return { ordering: "-visit_date", ...visitListSearch.params(raw) };
}

/**
 * `GET /notifications/` narrows by `unread` and `kind`. Only `unread` is offered:
 * five kinds is not yet a list anyone needs to narrow, and the question people
 * bring to this screen is "what haven't I seen".
 *
 * `true` alone is accepted. The server reads `false` as "read only", which is
 * a filter nobody asked for, and "all" is the parameter being absent.
 */
export const notificationFilters: ListFilter[] = [
  {
    param: "unread",
    labelKey: "notification.filterUnread",
    options: [{ value: "true", labelKey: "notification.filterUnread" }],
  },
];

export const notificationListSearch = listSearchSchema(notificationFilters);

/**
 * What the plan screen narrows by — every filter `GET /planned-visits/` takes
 * except `customer`, a reference into thousands that would need a picker.
 *
 * `period` is here so it survives the other filters changing: the list state
 * keeps only parameters it knows. It has no control in the bar — the month
 * picker above the table sets it — and a chip once it is not the current
 * month, so a plan for November never reads as this month's. Its absence means
 * the current month, so the default is never written into the address.
 *
 * `district` and `technician` are ids whose names arrive with data, so their
 * menus are handed options on screen. `unassigned` takes `true` alone: "the
 * assigned ones" is not a question anyone brings to a plan, and `false` would
 * offer it. `due_before` is inclusive on the server, and is what the summary's
 * "overdue" link sets, together with `status=planned`.
 */
export const planFilters: ListFilter[] = [
  {
    param: "period",
    labelKey: "plan.fields.period",
    options: [],
    kind: "scope",
    accepts: isPeriod,
    formatValue: (value) => monthYearLabel(`${value}-01`),
  },
  idMenuFilter({ param: "technician", labelKey: "plan.fields.technician" }),
  {
    param: "unassigned",
    labelKey: "plan.filters.unassigned",
    options: [{ value: "true", labelKey: "plan.filters.unassignedOnly" }],
  },
  enumFilter({
    param: "status",
    labelKey: "plan.fields.status",
    namespace: "plan.status",
    values: ["planned", "done", "cancelled"],
  }),
  idMenuFilter({ param: "district", labelKey: "plan.fields.district" }),
  dateFilter({ param: "due_before", labelKey: "plan.filters.dueBefore" }),
];

export const planListSearch = listSearchSchema(planFilters);

/** The month the plan screen shows when the address names none: this one. */
export function currentPeriod(): string {
  return periodOf(todayIso());
}

/**
 * The list's request. The period is always named, because the server requires
 * it — the URL's when it has one, the current month's otherwise. One function
 * for the route's prefetch and the screen, so both warm and read one key.
 */
export function planListParams(raw: Record<string, unknown>) {
  const params = planListSearch.params(raw);
  const period = typeof params.period === "string" ? params.period : currentPeriod();
  return { ...params, period };
}

/**
 * What the fault board narrows by. `status` is one value at a time on the
 * server; with none chosen the board shows every still-active status at once
 * (see FaultBoardScreen), which no single filter value expresses. `technician`
 * and `customer` are ids whose names arrive with data, so their menus are
 * handed options on screen.
 */
export const faultFilters: ListFilter[] = [
  enumFilter({
    param: "status",
    labelKey: "fault.fields.status",
    namespace: "fault.status",
    values: ["open", "assigned", "on_site", "resolved", "closed", "cancelled"],
  }),
  enumFilter({
    param: "priority",
    labelKey: "fault.fields.priority",
    namespace: "fault.priority",
    values: ["emergency", "high", "normal"],
  }),
  idMenuFilter({ param: "technician", labelKey: "fault.fields.technician" }),
  idMenuFilter({ param: "customer", labelKey: "fault.fields.customer" }),
];

export const faultListSearch = listSearchSchema(faultFilters);

/**
 * The inspection due list's window, in days. Absent means the server's default
 * (60), so the default is never written into the address.
 */
export const inspectionDueFilters: ListFilter[] = [
  {
    param: "days",
    labelKey: "inspection.window",
    options: [
      { value: "30", labelKey: "inspection.windowDays" },
      { value: "60", labelKey: "inspection.windowDays" },
      { value: "90", labelKey: "inspection.windowDays" },
    ],
  },
];

export const inspectionDueSearch = listSearchSchema(inspectionDueFilters);

/** The window a raw search names, or the default. Shared by the route's prefetch and the screen. */
export function inspectionDueDays(raw: Record<string, unknown>): number {
  const days = Number(inspectionDueSearch.params(raw).days);
  return Number.isInteger(days) && days > 0 ? days : 60;
}

/**
 * What `GET /invoice-drafts/` narrows by. `period` is a month the drafts
 * overlap, and `customer` an id; both menus are handed their options on
 * screen. `needs_price` takes `true` alone — "the ones waiting for me" — and
 * `contract` arrives on a link from a contract's own page, shown as a chip.
 */
export const billingFilters: ListFilter[] = [
  enumFilter({
    param: "status",
    labelKey: "billing.fields.status",
    namespace: "billing.status",
    values: ["draft", "issued", "paid", "cancelled"],
  }),
  {
    param: "period",
    labelKey: "billing.fields.period",
    options: [],
    accepts: (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
    formatValue: (value) => monthYearLabel(`${value}-01`),
  },
  idMenuFilter({ param: "customer", labelKey: "billing.fields.customer" }),
  {
    param: "needs_price",
    labelKey: "billing.filters.needsPrice",
    options: [{ value: "true", labelKey: "billing.filters.needsPriceOnly" }],
  },
  scopeFilter({ param: "contract", labelKey: "billing.fields.contract" }),
];

export const billingListSearch = listSearchSchema(billingFilters);
