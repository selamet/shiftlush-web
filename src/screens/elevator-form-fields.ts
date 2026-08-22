/**
 * The elevator record, described once.
 *
 * Thirty-one fields across six tabs. Declaring them as data rather than as
 * markup is what lets the form count what is filled, count what the server
 * rejected on each tab, and find the tab holding the first error — all from the
 * same list the inputs are rendered from, so the counts cannot drift from what
 * is on screen.
 */

export type FieldKind = "text" | "number" | "date" | "select" | "checkbox" | "textarea";

export interface FieldSpec {
  /** The API field name. Also the input's `name`, so the two cannot disagree. */
  name: string;
  labelKey: string;
  kind: FieldKind;
  /** Enum namespace for a select, e.g. `elevator.category`. */
  enumKey?: string;
  options?: readonly string[];
  required?: boolean;
  hintKey?: string;
  maxLength?: number;
  /** Rendered full width rather than in the two-column grid. */
  wide?: boolean;
}

export interface TabSpec {
  key: string;
  labelKey: string;
  fields: FieldSpec[];
}

export const CATEGORIES = [
  "passenger",
  "freight",
  "passenger_freight",
  "dumbwaiter",
  "accessibility_platform",
  "vehicle",
] as const;

export const DRIVE_TYPES = ["geared_electric", "gearless_electric", "hydraulic"] as const;
export const CONTROL_TYPES = [
  "simple_collective",
  "down_collective",
  "full_collective",
  "group_control",
] as const;
export const DOOR_TYPES = [
  "automatic_center",
  "automatic_side",
  "semi_automatic",
  "manual",
] as const;
export const MACHINE_ROOMS = ["present", "absent", "partial"] as const;
export const INSPECTION_LABELS = ["green", "blue", "yellow", "red", "none"] as const;

export const TABS: TabSpec[] = [
  {
    key: "identity",
    labelKey: "elevator.tabs.identity",
    fields: [
      {
        name: "registration_number",
        labelKey: "elevator.fields.registrationNumber",
        kind: "text",
        maxLength: 40,
      },
      { name: "name", labelKey: "elevator.singular", kind: "text", maxLength: 60 },
      {
        name: "internal_code",
        labelKey: "elevator.fields.internalCode",
        kind: "text",
        maxLength: 20,
      },
    ],
  },
  {
    key: "classification",
    labelKey: "elevator.tabs.classification",
    fields: [
      {
        name: "category",
        labelKey: "elevator.fields.category",
        kind: "select",
        enumKey: "elevator.category",
        options: CATEGORIES,
      },
      {
        name: "drive_type",
        labelKey: "elevator.fields.driveType",
        kind: "select",
        enumKey: "elevator.driveType",
        options: DRIVE_TYPES,
      },
      {
        name: "control_type",
        labelKey: "elevator.fields.controlType",
        kind: "select",
        enumKey: "elevator.controlType",
        options: CONTROL_TYPES,
      },
      {
        name: "door_type",
        labelKey: "elevator.fields.doorType",
        kind: "select",
        enumKey: "elevator.doorType",
        options: DOOR_TYPES,
      },
      {
        name: "machine_room",
        labelKey: "elevator.fields.machineRoom",
        kind: "select",
        enumKey: "elevator.machineRoom",
        options: MACHINE_ROOMS,
      },
      {
        name: "has_car_door",
        labelKey: "elevator.fields.hasCarDoor",
        kind: "checkbox",
        // A serious non-conformity when absent, which is why it is a record
        // field rather than an inspection note.
        hintKey: "elevator.hints.hasCarDoorHint",
        wide: true,
      },
    ],
  },
  {
    key: "technical",
    labelKey: "elevator.tabs.technical",
    fields: [
      { name: "capacity_kg", labelKey: "elevator.fields.capacityKg", kind: "number" },
      { name: "capacity_persons", labelKey: "elevator.fields.capacityPersons", kind: "number" },
      { name: "stop_count", labelKey: "elevator.fields.stopCount", kind: "number" },
      { name: "entrance_count", labelKey: "elevator.fields.entranceCount", kind: "number" },
      { name: "speed_mps", labelKey: "elevator.fields.speedMps", kind: "text" },
      { name: "pit_depth_mm", labelKey: "elevator.fields.pitDepthMm", kind: "number" },
      { name: "headroom_mm", labelKey: "elevator.fields.headroomMm", kind: "number" },
      { name: "car_weight_kg", labelKey: "elevator.fields.carWeightKg", kind: "number" },
    ],
  },
  {
    key: "manufacturing",
    labelKey: "elevator.tabs.manufacturing",
    fields: [
      { name: "brand", labelKey: "elevator.fields.brand", kind: "text", maxLength: 60 },
      { name: "model", labelKey: "elevator.fields.model", kind: "text", maxLength: 60 },
      {
        name: "serial_number",
        labelKey: "elevator.fields.serialNumber",
        kind: "text",
        maxLength: 60,
      },
      {
        name: "manufacturer",
        labelKey: "elevator.fields.manufacturer",
        kind: "text",
        maxLength: 120,
      },
      { name: "installer", labelKey: "elevator.fields.installer", kind: "text", maxLength: 120 },
      {
        name: "installation_date",
        labelKey: "elevator.fields.installationDate",
        kind: "date",
      },
      {
        name: "commissioning_date",
        labelKey: "elevator.fields.commissioningDate",
        kind: "date",
      },
      {
        name: "ce_certificate_number",
        labelKey: "elevator.fields.ceCertificateNumber",
        kind: "text",
        maxLength: 60,
      },
      {
        name: "warranty_end_date",
        labelKey: "elevator.fields.warrantyEndDate",
        kind: "date",
      },
    ],
  },
  {
    key: "inspection",
    labelKey: "elevator.tabs.inspection",
    fields: [
      {
        name: "inspection_label",
        labelKey: "elevator.fields.inspectionLabel",
        kind: "select",
        enumKey: "elevator.inspectionLabel",
        options: INSPECTION_LABELS,
        required: true,
      },
      {
        name: "last_inspection_date",
        labelKey: "elevator.fields.lastInspectionDate",
        kind: "date",
      },
      {
        name: "next_inspection_date",
        labelKey: "elevator.fields.nextInspectionDate",
        kind: "date",
      },
      {
        name: "inspection_body",
        labelKey: "elevator.fields.inspectionBody",
        kind: "text",
        maxLength: 120,
      },
      {
        name: "inspection_report_number",
        labelKey: "elevator.fields.inspectionReportNumber",
        kind: "text",
        maxLength: 60,
      },
    ],
  },
];

export const ALL_FIELDS: FieldSpec[] = TABS.flatMap((tab) => tab.fields);

/** Which tab a field lives on, for turning a server error into a place to go. */
export const TAB_OF_FIELD: Record<string, string> = Object.fromEntries(
  TABS.flatMap((tab) => tab.fields.map((field) => [field.name, tab.key])),
);
