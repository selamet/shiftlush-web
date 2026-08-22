/**
 * The things a contract screen shows that the record does not store.
 *
 * Split from the money on purpose. Totals are computed on the server, because
 * adding decimals up in JavaScript is how a contract worth 4,750.00 becomes
 * 4,749.999999999999. These are dates, and two of them depend on *now* — which
 * is the reader's clock, not the server's. A "days remaining" computed in
 * Istanbul and rendered in Berlin should say what the reader's calendar says.
 */
import type { Contract } from "@/api/queries";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from today until the date, negative once it has passed. */
export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - midnight.getTime()) / MS_PER_DAY);
}

/**
 * When somebody should be told the contract is ending.
 *
 * The notice period counted back from the end date. Null when no period is set,
 * rather than defaulting to a number — a contract nobody has given a notice
 * period has no reminder date, and inventing one would put a date on a screen
 * that exists nowhere else.
 */
export function reminderDate(contract: Pick<Contract, "end_date" | "renewal_notice_days">) {
  if (!contract.end_date || !contract.renewal_notice_days) return null;
  const end = new Date(`${contract.end_date}T00:00:00`);
  end.setDate(end.getDate() - contract.renewal_notice_days);
  return end.toISOString().slice(0, 10);
}

/**
 * The term a renewal would run for: the day after this one ends, for as long as
 * this one ran.
 *
 * A proposal the renewal dialogue starts from, not a decision — the server
 * takes both dates and the user can change either.
 */
export function proposedRenewal(contract: Pick<Contract, "start_date" | "end_date">) {
  if (!contract.start_date || !contract.end_date) return null;
  const start = new Date(`${contract.end_date}T00:00:00`);
  start.setDate(start.getDate() + 1);

  const previousStart = new Date(`${contract.start_date}T00:00:00`);
  const previousEnd = new Date(`${contract.end_date}T00:00:00`);
  const lengthInDays = Math.round(
    (previousEnd.getTime() - previousStart.getTime()) / MS_PER_DAY,
  );

  const end = new Date(start);
  end.setDate(end.getDate() + lengthInDays);

  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** How many distinct buildings the contract covers, from its lines. */
export function buildingNames(contract: Pick<Contract, "lines">): string[] {
  const names = new Set<string>();
  for (const line of contract.lines ?? []) {
    if (line.removed_at === null && line.building_name) names.add(line.building_name);
  }
  return [...names];
}

/** The lines still being billed. A closed line stays on the record as history. */
export function openLines(contract: Pick<Contract, "lines">) {
  return (contract.lines ?? []).filter((line) => line.removed_at === null);
}
