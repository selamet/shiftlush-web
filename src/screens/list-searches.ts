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
