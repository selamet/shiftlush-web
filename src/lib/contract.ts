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
import { addDays, isIsoDate, toIso } from "@/lib/date";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between two calendar days, counted in UTC.
 *
 * Not because these are UTC dates — they are not, they are days on a wall
 * calendar. UTC is simply the one axis on which every day is exactly twenty-four
 * hours long, so the subtraction cannot pick up the spare hour a daylight-saving
 * change puts in the middle of a span.
 */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY;
}

/** Whole days from today until the date, negative once it has passed. */
export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!isIsoDate(date)) return null;
  // The reader's calendar day, not the server's: "expires in 3 days" should
  // agree with the calendar on the wall next to whoever is reading it.
  return daysBetween(toIso(today), date);
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
  if (!isIsoDate(contract.end_date) || !contract.renewal_notice_days) return null;
  return addDays(contract.end_date, -contract.renewal_notice_days);
}

/**
 * The term a renewal would run for: the day after this one ends, for as long as
 * this one ran.
 *
 * A proposal the renewal dialogue starts from, not a decision — the server
 * takes both dates and the user can change either.
 */
export function proposedRenewal(contract: Pick<Contract, "start_date" | "end_date">) {
  if (!isIsoDate(contract.start_date) || !isIsoDate(contract.end_date)) return null;
  // The day *after* the old term ends. A renewal starting on the closing day
  // would bill both terms for it.
  const start = addDays(contract.end_date, 1);
  const lengthInDays = daysBetween(contract.start_date, contract.end_date);
  return { start, end: addDays(start, lengthInDays) };
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

/**
 * The other half: lines that have been closed.
 *
 * The counterpart to `openLines` and the reason that function is a filter
 * rather than a deletion. These are periods the contract really covered and
 * really billed for, and a screen that only ever renders the open lines tells
 * the user their history was thrown away when an elevator came off.
 *
 * Newest first: what was closed most recently is what someone is looking for.
 */
export function closedLines(contract: Pick<Contract, "lines">) {
  return (contract.lines ?? [])
    .filter((line) => line.removed_at !== null)
    .sort((a, b) => (b.removed_at ?? "").localeCompare(a.removed_at ?? ""));
}
