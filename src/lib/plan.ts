/**
 * The maintenance plan, as the two people who read it need it.
 *
 * The office reads a month: every row, in route order, with the ones that
 * slipped standing out. The technician reads a day and a week: what to do
 * today, what is coming, and nothing else. Which of a month's rows belong to
 * "today" and "this week" is a decision about dates, and dates are where code
 * goes quietly wrong — so it lives here, as plain functions of plain values,
 * and the unit suite reads them directly.
 *
 * Every date here is a calendar day, `YYYY-MM-DD`, compared as a string. The
 * format sorts the way the calendar does, and no `Date` is built from a stored
 * day — see lib/date for why that is the rule.
 */
import type { PlannedVisitStatus } from "@/api/enums";
import { MAX_PAGE_SIZE } from "@/api/queries";
import type { Role } from "@/components/layout/nav-config";
import { addDays, fromIso, toIso, todayIso } from "@/lib/date";

/** The fields of a planned row these rules read. */
export interface PlanRow {
  due_date: string;
  planned_date: string | null;
  status: PlannedVisitStatus;
  latest_visit_status?: string | null;
}

/** The month a day falls in, as the API spells a period: `YYYY-MM`. */
export function periodOf(day: string): string {
  return day.slice(0, 7);
}

/** The month after `period`, for the picker's "next month". */
export function nextPeriod(period: string): string {
  return periodOf(addDays(`${period}-28`, 7));
}

/** The month before `period`. */
export function previousPeriod(period: string): string {
  return periodOf(addDays(`${period}-01`, -1));
}

/** True for a value the API accepts as a period. */
export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * Monday to Sunday around `today`.
 *
 * Monday first, because that is the week here — `getDay()` counts from Sunday,
 * and a week computed from it would start the technician's week a day early.
 */
export function weekRange(today: string): { start: string; end: string } {
  const date = fromIso(today);
  if (!date) return { start: today, end: today };
  const sinceMonday = (date.getDay() + 6) % 7;
  const start = toIso(new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday));
  return { start, end: addDays(start, 6) };
}

/**
 * The periods a week touches — one, or two when it crosses a month end.
 *
 * The plan is fetched a month at a time, so a week that starts on the 28th has
 * to ask for both months or it silently loses its last few days.
 */
export function periodsForWeek(today: string): string[] {
  const { start, end } = weekRange(today);
  const first = periodOf(start);
  const last = periodOf(end);
  return first === last ? [first] : [first, last];
}

/**
 * Whether a row is on today's list.
 *
 * A row the office gave a date is on the list for that date, done or not — a
 * technician checking their day wants to see what they already finished as
 * well as what is left. A row with no date is on today's list once it is due,
 * for as long as it is still to do: an undated row that slipped past its due
 * day is exactly the one that must not drop off the list. Cancelled rows are
 * never on it.
 */
export function isDueToday(row: PlanRow, today: string): boolean {
  if (row.status === "cancelled") return false;
  if (row.planned_date) return row.planned_date === today;
  return row.status === "planned" && row.due_date <= today;
}

/**
 * Whether a row is on this week's list.
 *
 * Everything on today's list, and every row whose day — the planned date when
 * the office set one, the due date otherwise — falls between Monday and Sunday.
 * The planned date wins because it is the plan: a row due on Tuesday that the
 * office moved to next Monday is next week's work, not this week's.
 */
export function isDueThisWeek(row: PlanRow, today: string): boolean {
  if (row.status === "cancelled") return false;
  if (isDueToday(row, today)) return true;
  const { start, end } = weekRange(today);
  const day = row.planned_date ?? row.due_date;
  return day >= start && day <= end;
}

/**
 * Overdue: still to do, and its due day has passed.
 *
 * The server sends `is_overdue` and the screens read that. This is the same
 * rule for the one place that needs it without a row in hand — the summary
 * link, which narrows the list to "planned, due before today".
 */
export function overdueFilter(today: string): { status: "planned"; due_before: string } {
  // `due_before` is inclusive on the server, so "before today" is yesterday.
  return { status: "planned", due_before: addDays(today, -1) };
}

/**
 * Tried and not done: somebody went, recorded a visit, and it was cut short or
 * they were turned away. Still on the plan, and worth seeing apart from a row
 * nobody has touched — the next attempt needs to know there was a first.
 */
export function triedNotDone(row: PlanRow): boolean {
  return row.status === "planned" && Boolean(row.latest_visit_status);
}

/** Who reads the month's plan and edits it — the server's matrix, mirrored. */
export function canManagePlan(role: Role | null): boolean {
  return role === "owner" || role === "admin" || role === "operations";
}

/**
 * Where a person lands after signing in, and where `/` sends them.
 *
 * A technician opens the app to find out what to do today, and an accountant
 * to see what is waiting to be invoiced, so those are their first screens;
 * everybody else starts from the register of lifts.
 */
export function homePath(role: Role | null | undefined): "/today" | "/billing" | "/elevators" {
  if (role === "technician") return "/today";
  if (role === "accountant") return "/billing";
  return "/elevators";
}

/**
 * The request behind a technician's lists, one per month.
 *
 * Here rather than on the screen because the route prefetches it and the
 * router is in the entry chunk. `me` lets the server resolve the caller, so
 * the list needs no second request to learn who is asking. A technician's
 * month fits in one page of the largest size the server serves.
 */
export function myPlanParams(period: string) {
  return { period, technician: "me", page_size: MAX_PAGE_SIZE };
}

/**
 * The request behind an elevator's plan card: this month's row for that lift.
 * Shared with the elevator route's prefetch, for the reason `myPlanParams` is.
 */
export function elevatorPlanParams(elevatorId: string) {
  return { period: periodOf(todayIso()), elevator: elevatorId, page_size: 1 };
}

/** Who sees plan rows at all: the office, and technicians (their own and unassigned). */
export function canReadPlan(role: Role | null): boolean {
  return canManagePlan(role) || role === "technician";
}
