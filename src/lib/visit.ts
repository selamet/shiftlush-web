/**
 * The rules a maintenance visit form applies before it asks the server.
 *
 * Kept apart from the screen for the same reason `lib/contract.ts` is: these
 * are decisions with consequences — a visit recorded as complete is a signed
 * statement that sixteen things were looked at — and a decision buried in a
 * component can only be checked by rendering it. Here each one is a function
 * of plain values and the unit suite reads it directly.
 *
 * None of this is a second validator. The server still decides whether the
 * contract backs the elevator, whether the technician may be named and whether
 * the checklist is well formed. What lives here is what the *form* owes the
 * person filling it in: which answers are still missing, and what exactly gets
 * sent once they are given.
 */
import type { components } from "@/api/generated";
import {
  allOf,
  type MaintenanceChecklistItem,
  type MaintenanceChecklistResult,
  type MaintenanceVisitStatus,
} from "@/api/enums";
import type { Role } from "@/components/layout/nav-config";

type VisitWrite = components["schemas"]["MaintenanceVisitWriteRequest"];

/**
 * The sixteen rows, in the order a technician meets them on a round.
 *
 * The contract's own order, which already walks the lift the way a round does:
 * the machinery, the doors, the car, the safety devices, then the pit, the
 * machine room and the earth. Bound to the enum so a seventeenth item the API
 * adds is a compile error here rather than a row nobody can answer — and a
 * completed visit that can never be submitted.
 */
export const CHECKLIST_ITEMS = allOf<MaintenanceChecklistItem>()([
  "brake_system",
  "hoisting_ropes",
  "landing_doors",
  "car_door_safety_edge",
  "limit_switches",
  "guide_rail_lubrication",
  "car_lighting",
  "emergency_lighting",
  "emergency_alarm_intercom",
  "control_panel_buttons",
  "leveling_accuracy",
  "overload_device",
  "automatic_rescue_device",
  "pit_condition",
  "machine_room_condition",
  "earthing_grounding",
]);

/** Left to right as the segmented control draws them: the expected answer first. */
export const CHECKLIST_RESULTS = allOf<MaintenanceChecklistResult>()([
  "ok",
  "attention_needed",
  "not_applicable",
]);

/** `completed` first because it is the default and by far the commonest outcome. */
export const VISIT_STATUSES = allOf<MaintenanceVisitStatus>()([
  "completed",
  "incomplete",
  "access_denied",
]);

/** How many photos one visit form will carry. More than this is a gallery, not evidence. */
export const MAX_VISIT_PHOTOS = 4;

export interface ChecklistAnswer {
  result: MaintenanceChecklistResult;
  /** Only shown, and only sent, under a row marked `attention_needed`. */
  note: string;
}

/**
 * The answers given so far. An item that is absent has not been answered.
 *
 * Absent rather than defaulted, and that is the point of the whole form: a row
 * that starts on "OK" is a signature nobody gave. A visit is evidence that a
 * named person checked the brakes; a checklist the technician could submit by
 * scrolling past it is evidence of nothing.
 */
export type Checklist = Partial<Record<MaintenanceChecklistItem, ChecklistAnswer>>;

export function answeredCount(checklist: Checklist): number {
  return CHECKLIST_ITEMS.filter((item) => checklist[item] !== undefined).length;
}

/** The first row still waiting for an answer, so the form can take the reader to it. */
export function firstUnanswered(checklist: Checklist): MaintenanceChecklistItem | null {
  return CHECKLIST_ITEMS.find((item) => checklist[item] === undefined) ?? null;
}

/**
 * Why the form cannot be sent yet, or `null` when it can.
 *
 * One rule: a visit recorded as complete answers every row. A visit that was
 * cut short or never got through the door has, by definition, rows nobody
 * could check — demanding an answer for those would push the technician into
 * inventing one, which is the exact failure the empty default exists to stop.
 * Those statuses need a reason instead, and the browser's `required` on that
 * field already holds the line without a rule here.
 */
export function submitBlocker(
  status: MaintenanceVisitStatus,
  checklist: Checklist,
): { missing: number } | null {
  if (status !== "completed") return null;
  const missing = CHECKLIST_ITEMS.length - answeredCount(checklist);
  return missing > 0 ? { missing } : null;
}

/** Who may record a visit at all — the server's matrix, mirrored to hide what it would refuse. */
export function canRecordVisits(role: Role | null): boolean {
  return (
    role === "owner" || role === "admin" || role === "operations" || role === "technician"
  );
}

/**
 * Reading is the same four roles as writing today. A separate function anyway,
 * because they are separate rows of the server's matrix and the day one moves
 * the call sites should not all have to be found again.
 */
export function canReadVisits(role: Role | null): boolean {
  return (
    role === "owner" || role === "admin" || role === "operations" || role === "technician"
  );
}

export interface VisitFormState {
  elevatorId: string;
  contractId: string;
  role: Role | null;
  /** Ignored for a technician; see `buildVisitBody`. */
  technicianId?: string;
  visitDate: string;
  status: MaintenanceVisitStatus;
  statusNote?: string;
  workNotes?: string;
  partsReplaced?: string;
  checklist: Checklist;
}

/** "" and whitespace are "left blank", which is said by leaving the key out. */
function filled(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The request body, written out field by field.
 *
 * Not `formValues()` like the other forms, because most of this form is not in
 * the form: the checklist and the status are state that drives what is shown,
 * and the elevator, contract and date are facts the screen already holds. What
 * the person typed is a minority of what is sent.
 *
 * Three omissions, each deliberate:
 *
 * - `technician` for a technician. The server records the visit as theirs and
 *   refuses one naming anybody else, so sending their own id would be a
 *   chance to send the wrong one and nothing else.
 * - `status_note` on a completed visit. The field is hidden once the status is
 *   back on "completed", and a reason typed for "access denied" and then
 *   abandoned is not a note about a visit that went fine.
 * - A note on any row not marked `attention_needed`, for the same reason: the
 *   box is only on screen under that answer, and what is sent is what was
 *   visible when the button was pressed.
 *
 * Rows go in checklist order rather than the order they were tapped, so two
 * submissions of the same answers are the same body — which is what the
 * idempotency key compares when a retry arrives.
 */
export function buildVisitBody(state: VisitFormState): VisitWrite {
  const body: VisitWrite = {
    elevator: state.elevatorId,
    contract: state.contractId,
    visit_date: state.visitDate,
    status: state.status,
  };

  const technician = filled(state.technicianId);
  if (state.role !== "technician" && technician) body.technician = technician;

  const statusNote = filled(state.statusNote);
  if (state.status !== "completed" && statusNote) body.status_note = statusNote;

  const workNotes = filled(state.workNotes);
  if (workNotes) body.work_notes = workNotes;
  const partsReplaced = filled(state.partsReplaced);
  if (partsReplaced) body.parts_replaced = partsReplaced;

  const items: NonNullable<VisitWrite["items"]> = [];
  for (const item of CHECKLIST_ITEMS) {
    const answer = state.checklist[item];
    if (!answer) continue;
    items.push({
      item,
      result: answer.result,
      note: answer.result === "attention_needed" ? (filled(answer.note) ?? "") : "",
    });
  }
  // Left out when nothing was answered. On a create the two mean the same
  // thing, and an empty list is the one body that reads as "clear the
  // checklist" if this ever becomes an edit.
  if (items.length > 0) body.items = items;

  return body;
}

/** How many of an elevator's visits its own page shows before "all of them". */
export const ELEVATOR_HISTORY_SIZE = 5;

/**
 * The request behind an elevator's history panel.
 *
 * Here rather than beside the panel because the route prefetches it, and the
 * router is in the entry chunk: importing it from the component module would
 * pull the panel, and everything it renders, in with it.
 */
export function elevatorHistoryParams(elevatorId: string) {
  return { elevator: elevatorId, ordering: "-visit_date", page_size: ELEVATOR_HISTORY_SIZE };
}

/** The rows a reader should look at first. */
export function attentionCount(items: readonly { result: string }[]): number {
  return items.filter((item) => item.result === "attention_needed").length;
}
