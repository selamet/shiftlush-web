/**
 * The decisions the fault screens make, as plain functions.
 *
 * Which buttons a person sees on a fault, what the timeline says happened and
 * in what order, how long a lift has been waiting, and what priority a
 * resident's answers amount to. Each is a question with consequences — a
 * missing "arrived" button leaves a technician unable to record that they are
 * at a lift with somebody trapped in it — so each is answered here, where the
 * unit suite can read it without a renderer.
 *
 * None of this is a second validator. The server refuses a transition from the
 * wrong state (`FAULT_TRANSITION_NOT_ALLOWED`) and a technician acting on a
 * fault that is not theirs; these functions decide only what is worth
 * offering, so a person is not handed a button whose only answer is a refusal.
 */
import type { TFunction } from "i18next";
import type { FaultPriority, FaultStatus } from "@/api/enums";
import { allOf } from "@/api/enums";
import type { Fault } from "@/api/queries";
import type { Role } from "@/components/layout/nav-config";

export const FAULT_PRIORITIES = allOf<FaultPriority>()(["emergency", "high", "normal"]);

export const FAULT_STATUSES = allOf<FaultStatus>()([
  "open",
  "assigned",
  "on_site",
  "resolved",
  "closed",
  "cancelled",
]);

/**
 * The statuses that are still somebody's job. The board shows these by
 * default; resolved is among them because it is waiting for the office to
 * check the work and close it.
 */
export const ACTIVE_STATUSES = ["open", "assigned", "on_site", "resolved"] as const satisfies readonly FaultStatus[];

/** A technician's own list: what has been given to them and is not yet done. */
export const MY_ACTIVE_STATUSES = ["assigned", "on_site"] as const satisfies readonly FaultStatus[];

export function isActive(status: FaultStatus): boolean {
  return (ACTIVE_STATUSES as readonly FaultStatus[]).includes(status);
}

/** Who works with faults at all — the server's matrix, mirrored to hide what it would refuse. */
export function canUseFaults(role: Role | null): boolean {
  return isOffice(role) || role === "technician";
}

/** The roles that assign, close, cancel and correct. */
export function isOffice(role: Role | null): boolean {
  return role === "owner" || role === "admin" || role === "operations";
}

export type FaultAction = "assign" | "arrive" | "resolve" | "close" | "cancel" | "edit";

/**
 * What the viewer may do to this fault now.
 *
 * The office may do every step on a technician's behalf — a phone call from
 * the field is a normal way for "I'm there" to reach the system. A technician
 * may record arriving and resolving, and only on a fault given to them. The
 * states follow the server's transitions: assign from open or assigned (to
 * send somebody else), arrive from assigned, resolve from on site, close from
 * resolved, cancel from anything before resolved.
 */
export function availableActions(
  fault: Pick<Fault, "status" | "technician">,
  role: Role | null,
  userId: string | null,
): FaultAction[] {
  const office = isOffice(role);
  const mine = role === "technician" && userId !== null && fault.technician === userId;
  const actions: FaultAction[] = [];
  const { status } = fault;

  if (office && (status === "open" || status === "assigned")) actions.push("assign");
  if ((office || mine) && status === "assigned") actions.push("arrive");
  if ((office || mine) && status === "on_site") actions.push("resolve");
  if (office && status === "resolved") actions.push("close");
  if (office && (status === "open" || status === "assigned" || status === "on_site")) {
    actions.push("cancel");
  }
  // Corrections end with the record: a closed or cancelled fault is history,
  // and its billable flag is what was invoiced or not.
  if (office && status !== "closed" && status !== "cancelled") actions.push("edit");
  return actions;
}

export type TimelineStep = "reported" | "assigned" | "on_site" | "resolved" | "closed" | "cancelled";

export interface TimelineEntry {
  step: TimelineStep;
  at: string;
  /** Who, when the record says. Already a name; never translated. */
  who: string | null;
}

/**
 * What happened to the fault, in the order it happened.
 *
 * Only the steps that did happen: a fault cancelled while open has two
 * entries, not six with four blanks. Sorted by time rather than by the order
 * of the states, because the office may record an arrival late — the timeline
 * shows when each thing was recorded, which is what the record can vouch for.
 *
 * "Who" is what the record knows: the reporter (a colleague, or the resident's
 * name if they left one), and the technician for the steps that are theirs.
 * The server does not record who closed or cancelled, so neither does this.
 */
export function faultTimeline(fault: Fault): TimelineEntry[] {
  const reporter = fault.reported_by_name || fault.reporter_name || null;
  const entries: Array<TimelineEntry | null> = [
    { step: "reported", at: fault.reported_at, who: reporter },
    fault.assigned_at ? { step: "assigned", at: fault.assigned_at, who: fault.technician_name } : null,
    fault.on_site_at ? { step: "on_site", at: fault.on_site_at, who: fault.technician_name } : null,
    fault.resolved_at ? { step: "resolved", at: fault.resolved_at, who: fault.technician_name } : null,
    fault.closed_at ? { step: "closed", at: fault.closed_at, who: null } : null,
    fault.cancelled_at ? { step: "cancelled", at: fault.cancelled_at, who: null } : null,
  ];
  return entries
    .filter((entry): entry is TimelineEntry => entry !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * How long the fault has waited for somebody to arrive, in seconds.
 *
 * Fixed once the technician is on site — the server's own figure. Until then
 * it runs: the board shows it ticking, because "reported forty minutes ago"
 * is the number the office is managing to.
 */
export function responseSeconds(
  fault: Pick<Fault, "reported_at" | "on_site_at" | "response_time_seconds" | "status">,
  now: number = Date.now(),
): number | null {
  if (fault.response_time_seconds !== null) return fault.response_time_seconds;
  if (fault.status === "cancelled") return null;
  const reported = Date.parse(fault.reported_at);
  if (Number.isNaN(reported)) return null;
  return Math.max(0, Math.floor((now - reported) / 1000));
}

/** Hours and minutes, days and hours, or under a minute — worded by the catalogue. */
export function formatDuration(seconds: number | null, t: TFunction): string {
  if (seconds === null) return "";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return t("fault.duration.underMinute");
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return t("fault.duration.daysHours", { days, hours });
  if (hours > 0) return t("fault.duration.hoursMinutes", { hours, minutes: rest });
  return t("fault.duration.minutes", { minutes: rest });
}

const RANK: Record<string, number> = { emergency: 0, high: 1, normal: 2 };

/**
 * The board's order: the most urgent first, and within a priority the one that
 * has waited longest. The server sorts each request the same way; this puts
 * the several active statuses, fetched separately, back into one order.
 */
export function boardOrder(
  a: Pick<Fault, "priority" | "reported_at">,
  b: Pick<Fault, "priority" | "reported_at">,
): number {
  const rank = (RANK[a.priority] ?? 3) - (RANK[b.priority] ?? 3);
  if (rank !== 0) return rank;
  return Date.parse(a.reported_at) - Date.parse(b.reported_at);
}

/**
 * The priority a resident's answers come to — the server's rule, said back to
 * them before they send. Somebody trapped is an emergency; a stopped lift is
 * urgent; anything else is a normal report. The resident never picks a
 * priority, so nobody has to know what the words mean to get help in time.
 */
export function publicPriority(answers: {
  someoneTrapped: boolean;
  elevatorStopped: boolean;
}): FaultPriority {
  if (answers.someoneTrapped) return "emergency";
  return answers.elevatorStopped ? "high" : "normal";
}

/**
 * The priority a staff report is sent with. Somebody trapped makes it an
 * emergency whatever was chosen — the server does the same, and the form says
 * so rather than showing one priority and recording another.
 */
export function staffPriority(chosen: FaultPriority, someoneTrapped: boolean): FaultPriority {
  return someoneTrapped ? "emergency" : chosen;
}

/** The board's request for one status, oldest first within priority. */
export function boardParams(params: Record<string, unknown>, status: FaultStatus) {
  return { ...params, status, ordering: "priority_rank,reported_at", page_size: 100 };
}

/**
 * A technician's own open faults, one request per state. Shared with the
 * route's prefetch, which is why it lives here and not on the screen.
 */
export function myFaultParams(userId: string, status: (typeof MY_ACTIVE_STATUSES)[number]) {
  return { technician: userId, status, ordering: "priority_rank,reported_at", page_size: 100 };
}
