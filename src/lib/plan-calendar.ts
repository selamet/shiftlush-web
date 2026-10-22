/**
 * The office calendar's rules, as plain functions of plain values.
 *
 * Which seven days a week shows, which cell each plan row sits in, where a
 * dragged row may land, and what a drop asks the server to change. The screen
 * only draws what these return, so the unit suite can read the decisions that
 * matter — dates and moves — without a browser. Every day is `YYYY-MM-DD`,
 * compared as a string, as in lib/plan.
 */
import type { PlannedVisitStatus } from "@/api/enums";
import { addDays } from "@/lib/date";
import { periodOf, weekRange } from "@/lib/plan";

/** The fields of a plan row the calendar reads. */
export interface CalendarRow {
  id: string;
  period: string;
  status: PlannedVisitStatus;
  technician: string | null;
  planned_date: string | null;
  due_date: string;
}

/** More visits than this on one technician's day is shown as a warning. A hint, never a limit. */
export const BUSY_DAY = 8;

/** Monday to Sunday of the week `day` falls in. */
export function weekDays(day: string): string[] {
  const { start } = weekRange(day);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** One cell: a technician (null for the unassigned row) on one day. */
export function cellKey(technician: string | null, day: string): string {
  return `${technician ?? ""}|${day}`;
}

export interface WeekLayout<Row extends CalendarRow = CalendarRow> {
  /** Rows planned for a day of the week, by `cellKey`. */
  cells: Map<string, Row[]>;
  /** Planned rows with no day yet: the oldest due first, so overdue leads. */
  tray: Row[];
}

/**
 * Where each row sits in a week. Done and cancelled rows keep their cell, so
 * the week reads true; only planned rows wait in the tray. A row planned for
 * another week is not this week's.
 */
export function layoutWeek<Row extends CalendarRow>(rows: readonly Row[], days: readonly string[]): WeekLayout<Row> {
  const shown = new Set(days);
  const cells = new Map<string, Row[]>();
  const tray: Row[] = [];
  for (const row of rows) {
    if (row.planned_date === null) {
      if (row.status === "planned") tray.push(row);
      continue;
    }
    if (!shown.has(row.planned_date)) continue;
    const key = cellKey(row.technician, row.planned_date);
    const cell = cells.get(key);
    if (cell) cell.push(row);
    else cells.set(key, [row]);
  }
  tray.sort((a, b) => (a.due_date === b.due_date ? a.id.localeCompare(b.id) : a.due_date < b.due_date ? -1 : 1));
  return { cells, tray };
}

/**
 * Whether a row may be dropped on `day` (null: back to the tray). The server
 * decides; this is what greys out the days it would refuse while a card is in
 * the air: a closed row stays where it is, and a day has to be inside the
 * row's month and not before today.
 */
export function isDropAllowed(row: CalendarRow, day: string | null, today: string): boolean {
  if (row.status !== "planned") return false;
  if (day === null) return true;
  return periodOf(day) === row.period && day >= today;
}

export type DropSpot = { technician: string | null; day: string } | { tray: true };

/** The PATCH body a drop asks for — only what changed — or null when nothing did. */
export function dropTarget(
  row: CalendarRow,
  spot: DropSpot,
): { technician?: string | null; planned_date?: string | null } | null {
  if ("tray" in spot) return row.planned_date === null ? null : { planned_date: null };
  const body: { technician?: string | null; planned_date?: string | null } = {};
  if (spot.technician !== row.technician) body.technician = spot.technician;
  if (spot.day !== row.planned_date) body.planned_date = spot.day;
  return Object.keys(body).length > 0 ? body : null;
}

/**
 * The month view's numbers: per day, how many visits each technician has —
 * planned or done, not cancelled, and only rows given a day. Keyed by
 * technician id; the unassigned count sits under "".
 */
export function monthLoad(rows: readonly CalendarRow[]): Map<string, Map<string, number>> {
  const load = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (row.planned_date === null || row.status === "cancelled") continue;
    const day = load.get(row.planned_date) ?? new Map<string, number>();
    const who = row.technician ?? "";
    day.set(who, (day.get(who) ?? 0) + 1);
    load.set(row.planned_date, day);
  }
  return load;
}
