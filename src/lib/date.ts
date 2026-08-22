/**
 * Calendar days, which are not instants.
 *
 * A contract's start date, an inspection date and a certificate's expiry are
 * days on a wall calendar. They have no hour, no minute and no timezone: the
 * 5th of March is the 5th of March whether it is read in Istanbul or in Sydney.
 * The API stores them as `YYYY-MM-DD` for exactly that reason.
 *
 * Two strings for one date, and they must never be confused:
 *
 *   stored    2026-03-05    ISO, what the API sends and receives
 *   displayed 05.03.2026    Turkish, what a person reads and types
 *
 * A component that keeps one string for both reads the 3rd of the month as
 * March and nobody notices, because up to the 5th of any month both readings
 * are real dates. So every function here is named for the direction it goes in,
 * and none of them accepts either format.
 *
 * The other trap is `Date`. `new Date("2026-03-05")` is parsed as UTC midnight;
 * `new Date("2026-03-05T00:00:00")` is parsed as local midnight. Read either
 * one back with `toISOString()` and the day moves, in one direction west of
 * Greenwich and the other east of it — silently, and only for some readers.
 * Nothing here ever parses or serialises a `Date` through a string: dates are
 * built from local calendar components and read back the same way, so the
 * round trip is the identity function in every timezone.
 */
import { DEFAULT_LOCALE } from "./i18n";

/** `YYYY-MM-DD`, the only shape the API speaks. */
const ISO_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `gg.aa.yyyy` as a person types it.
 *
 * One or two digits for the day and month, because nobody types the leading
 * zero of the 5th. Four for the year, and only four: a two-digit year would
 * make `05.03.20` a complete date on the way to typing `05.03.2026`, and the
 * calendar would jump to the year 2020 under the user's hands. The other
 * separators are accepted because a numeric keypad offers a slash and a
 * European keyboard a hyphen, and refusing them teaches nothing.
 */
const TYPED_SHAPE = /^(\d{1,2})[-./,](\d{1,2})[-./,](\d{4})$/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Days in a 1-based month. Day 0 of the next month is the last of this one. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isRealDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** True for a stored value the API would accept — shape *and* calendar. */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const match = ISO_SHAPE.exec(value);
  if (!match) return false;
  return isRealDay(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** A `Date` at local midnight on that day. Never from string parsing. */
export function fromIso(iso: string | null | undefined): Date | null {
  if (!isIsoDate(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The day a `Date` falls on where the reader is. Never `toISOString()`. */
export function toIso(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** Stored to displayed. Empty for anything that is not a stored date. */
export function toDisplay(iso: string | null | undefined): string {
  if (!isIsoDate(iso)) return "";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

/** Displayed to stored. Null when the text is not yet, or not at all, a date. */
export function fromDisplay(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = TYPED_SHAPE.exec(text.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!isRealDay(year, month, day)) return null;

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIso(now);
}

export function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/**
 * Months, clamped rather than overflowed.
 *
 * A month after the 31st of January is the 28th of February, not the 3rd of
 * March. `setMonth` overflows instead, which is how paging forward from the end
 * of a month skips one entirely.
 */
export function addMonths(iso: string, months: number): string {
  if (!isIsoDate(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);

  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total - targetYear * 12 + 1;

  return `${pad(targetYear, 4)}-${pad(targetMonth, 2)}-${pad(
    Math.min(day, daysInMonth(targetYear, targetMonth)),
    2,
  )}`;
}

export function startOfMonth(iso: string): string {
  return isIsoDate(iso) ? `${iso.slice(0, 7)}-01` : iso;
}

export function endOfMonth(iso: string): string {
  if (!isIsoDate(iso)) return iso;
  const [year, month] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${pad(daysInMonth(year, month), 2)}`;
}

/** Same calendar month, which for two ISO days is a string comparison. */
export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * The days a month's calendar shows, Monday first, six rows always.
 *
 * Six rows rather than the four to six a month actually needs: a grid that
 * changes height as you page through it moves the buttons under the pointer,
 * and the two empty-looking rows cost nothing.
 *
 * The leading and trailing days belong to the neighbouring months and are
 * returned as themselves rather than as blanks — someone looking for the 1st of
 * next month can see it and pick it.
 */
export function monthGrid(iso: string): string[][] {
  const first = fromIso(startOfMonth(iso));
  if (!first) return [];

  // getDay() counts from Sunday; the week here starts on Monday.
  const offset = (first.getDay() + 6) % 7;
  const start = toIso(new Date(first.getFullYear(), first.getMonth(), 1 - offset));

  const weeks: string[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: string[] = [];
    for (let day = 0; day < 7; day += 1) days.push(addDays(start, week * 7 + day));
    weeks.push(days);
  }
  return weeks;
}

/*
 * The names below come from Intl rather than from a list in this file. Turkish
 * month and weekday names are translations, and translations live in
 * messages/tr.json — except these, which the platform already knows and would
 * only drift from if they were written out by hand.
 *
 * No `timeZone` is set on any of these formatters, unlike the ones in
 * format.ts. Those format an instant the API sent and pin it to Istanbul so
 * every reader sees the same one. These format a `Date` that was built from
 * local calendar components and means nothing outside them: converting it to
 * another zone would shift the day it names for readers far enough east.
 */
const monthYearFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  month: "long",
  year: "numeric",
});

const longDateFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const weekdayShortFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, { weekday: "short" });
const weekdayLongFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, { weekday: "long" });

/** The heading over a calendar page: month and year, spelled out. */
export function monthYearLabel(iso: string): string {
  const date = fromIso(iso);
  return date ? monthYearFormatter.format(date) : "";
}

/** A whole date as it would be read aloud, for a cell's accessible name. */
export function longDateLabel(iso: string): string {
  const date = fromIso(iso);
  return date ? longDateFormatter.format(date) : "";
}

export interface WeekdayLabel {
  /** The column heading. */
  short: string;
  /** What the column heading abbreviates, for anyone reading the header. */
  long: string;
}

/**
 * The seven column headings, Monday first.
 *
 * Any Monday will do to seed them; the 1st of January 2024 was one.
 */
export function weekdayLabels(): WeekdayLabel[] {
  const labels: WeekdayLabel[] = [];
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(2024, 0, 1 + index);
    labels.push({ short: weekdayShortFormatter.format(day), long: weekdayLongFormatter.format(day) });
  }
  return labels;
}

export interface MaskedText {
  text: string;
  caret: number;
}

function isDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

/**
 * The separators typed for you, without the caret being taken away.
 *
 * A mask that reformats the whole string and lets the browser put the caret
 * back at the end is the single most irritating control there is: correcting
 * the month in a date you have already typed becomes impossible. So the caret
 * is tracked by *how many digits precede it*, which survives separators being
 * inserted and removed around it, and is put back at the same digit afterwards.
 *
 * `deleting` is what keeps backspace working. Appending the separator after two
 * digits is what makes typing flow — but do it while the user is deleting and
 * the separator they just erased reappears under their finger, and the field
 * can never be emptied. While deleting, nothing is appended and the caret is
 * not nudged forward past a separator either.
 */
export function maskTyping(raw: string, caret: number, deleting: boolean): MaskedText {
  const before = raw.slice(0, Math.max(0, caret)).replace(/\D/g, "").length;
  const stream = raw.replace(/[^\d\-./,]/g, "").replace(/[-/,]/g, ".");

  const widths = [2, 2, 4];
  const groups = ["", "", ""];
  let group = 0;

  for (const character of stream) {
    if (group >= groups.length) break;

    if (character === ".") {
      // A separator the user typed themselves ends the group early, which is
      // the whole of how `5.3.2026` gets typed. The group is left as the one
      // digit they gave it rather than padded to `05`: padding would insert a
      // character in front of the caret, which is the one thing this must not
      // do. `fromDisplay` reads a one-digit group, and blur tidies it.
      if (groups[group] !== "") group += 1;
      continue;
    }

    if (groups[group].length >= widths[group]) group += 1;
    if (group >= groups.length) break;
    groups[group] += character;
  }

  let text = groups.filter((value) => value !== "").join(".");

  // The separator typed for you, once a group can hold no more — and never
  // while deleting, or the one just erased reappears under the user's finger
  // and the field can never be emptied.
  const ended = group > 0 && group < groups.length && groups[group] === "";
  const filled = group < groups.length - 1 && groups[group].length === widths[group];
  if (!deleting && (ended || filled)) text += ".";

  let index = text.length;
  let seen = 0;
  for (let position = 0; position < text.length; position += 1) {
    if (seen === before) {
      index = position;
      break;
    }
    if (isDigit(text[position])) seen += 1;
  }

  // Typing across a group boundary lands in the next group rather than in front
  // of the separator, so the next keystroke goes where it was aimed.
  if (!deleting) {
    while (index < text.length && !isDigit(text[index])) index += 1;
  }

  return { text, caret: index };
}
