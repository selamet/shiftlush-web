#!/usr/bin/env node
/**
 * The date library, checked against the three ways date code goes wrong.
 *
 * 1. The stored string and the displayed string get confused. The API speaks
 *    `2026-03-05` and the screen speaks `05.03.2026`; a function that takes
 *    either one reads the 3rd of the month as March. Nobody notices, because
 *    up to the 5th of any month both readings are a real date — which is also
 *    why this cannot be caught by looking at a screen.
 *
 * 2. A date is put through `new Date(iso)` or read back with `toISOString()`.
 *    The first is parsed as UTC, the second is written as UTC, and a calendar
 *    day that never had an hour comes back a day early or a day late depending
 *    on which side of Greenwich the reader is. Every case below is run in four
 *    timezones for that reason, two of them chosen to be far enough out that
 *    the mistake cannot hide.
 *
 * 3. The month and day names are written out by hand, in a file that
 *    `npm run lint:tr` then forbids from containing Turkish. They come from
 *    Intl instead — and this script, which lives outside src/, is where the
 *    Turkish they must produce can actually be asserted.
 *
 * The typing mask is checked here too, keystroke by keystroke, because "the
 * caret does not jump" is a property of a sequence of edits and not of any one
 * of them.
 */
import { createServer } from "vite";

// Set before the module loads: the Intl formatters resolve the system zone
// when they are constructed, and the assertions about Turkish names below
// assume the zone the product actually runs in.
process.env.TZ = "Europe/Istanbul";

let failures = 0;
let checks = 0;

function ok(condition, description) {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.error(`  FAIL  ${description}`);
}

function equal(actual, expected, description) {
  checks += 1;
  if (actual === expected) return;
  failures += 1;
  console.error(`  FAIL  ${description}\n          expected ${expected}\n          actual   ${actual}`);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
  // Nothing here is served to a browser: one module is loaded on the server and
  // called. Scanning the whole app for dependencies to pre-bundle is work for a
  // client that never connects.
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const date = await server.ssrLoadModule("/src/lib/date.ts");

  /* ------------------------------------------------------------------ *
   * Stored and displayed are two different strings, and stay that way.
   * ------------------------------------------------------------------ */

  equal(date.toDisplay("2026-03-05"), "05.03.2026", "ISO to Turkish");
  equal(date.fromDisplay("05.03.2026"), "2026-03-05", "Turkish to ISO");

  // The whole reason the two are kept apart: swap the first two groups and it
  // is still a perfectly good date, just a different one.
  equal(date.fromDisplay("03.05.2026"), "2026-05-03", "the swapped reading is a different day");
  ok(
    date.fromDisplay("03.05.2026") !== date.fromDisplay("05.03.2026"),
    "3 March and 5 March do not collapse onto each other",
  );

  // Neither function will take the other's format, which is what stops the two
  // from ever being passed to the wrong one without a visible empty field.
  equal(date.fromDisplay("2026-03-05"), null, "an ISO string is not a typed Turkish date");
  equal(date.toDisplay("05.03.2026"), "", "a Turkish string is not a stored value");
  equal(date.toDisplay(null), "", "no date displays as nothing");
  equal(date.toDisplay(undefined), "", "an absent date displays as nothing");

  // Every day of a leap year, both ways round.
  let iso = "2024-01-01";
  let roundTrips = 0;
  while (iso <= "2024-12-31") {
    if (date.fromDisplay(date.toDisplay(iso)) !== iso) {
      failures += 1;
      console.error(`  FAIL  round trip lost ${iso}`);
      break;
    }
    roundTrips += 1;
    iso = date.addDays(iso, 1);
  }
  equal(roundTrips, 366, "every day of 2024 survives the round trip");

  /* ------------------------------------------------------------------ *
   * What a person is allowed to type.
   * ------------------------------------------------------------------ */

  equal(date.fromDisplay("5.3.2026"), "2026-03-05", "no leading zeros needed");
  equal(date.fromDisplay("05.3.2026"), "2026-03-05", "one leading zero is fine too");
  equal(date.fromDisplay(" 5.3.2026 "), "2026-03-05", "surrounding space is ignored");
  equal(date.fromDisplay("5/3/2026"), "2026-03-05", "the keypad slash is accepted");
  equal(date.fromDisplay("5-3-2026"), "2026-03-05", "the hyphen is accepted");

  equal(date.fromDisplay(""), null, "an empty box is not a date");
  equal(date.fromDisplay("05.03."), null, "a half-typed date is not a date");
  equal(date.fromDisplay("5.3.26"), null, "a two-digit year is refused, not guessed at");
  equal(date.fromDisplay("32.01.2026"), null, "there is no 32nd of January");
  equal(date.fromDisplay("05.13.2026"), null, "there is no thirteenth month");
  equal(date.fromDisplay("29.02.2026"), null, "2026 is not a leap year");
  equal(date.fromDisplay("29.02.2024"), "2024-02-29", "2024 is");

  ok(date.isIsoDate("2026-03-05"), "a real ISO day is stored");
  ok(!date.isIsoDate("2026-02-30"), "a shaped-but-impossible ISO day is not");
  ok(!date.isIsoDate("2026-3-5"), "an unpadded ISO day is not the API's format");

  /* ------------------------------------------------------------------ *
   * Typing, keystroke by keystroke. The caret is the assertion.
   * ------------------------------------------------------------------ */

  /** Types `keys` into an empty box, one key at a time, through the mask. */
  function type(keys) {
    let text = "";
    let caret = 0;
    const carets = [];
    for (const key of keys) {
      const raw = text.slice(0, caret) + key + text.slice(caret);
      const masked = date.maskTyping(raw, caret + 1, false);
      text = masked.text;
      caret = masked.caret;
      carets.push(caret);
    }
    return { text, caret, carets };
  }

  const padded = type("05032026");
  equal(padded.text, "05.03.2026", "eight digits become a full date");
  equal(padded.caret, 10, "and the caret ends after the last of them");
  ok(
    padded.carets.every((position, index) => index === 0 || position > padded.carets[index - 1]),
    "the caret only ever moves forward while typing",
  );

  const short = type("5.3.2026");
  equal(short.text, "5.3.2026", "a date typed with its own separators is left alone");
  equal(date.fromDisplay(short.text), "2026-03-05", "and still means the 5th of March");
  ok(
    short.carets.every((position, index) => index === 0 || position > short.carets[index - 1]),
    "the caret only ever moves forward here too",
  );

  equal(date.maskTyping("05", 2, false).text, "05.", "the separator is offered after the day");
  equal(date.maskTyping("05", 2, false).caret, 3, "with the caret past it, ready for the month");
  equal(date.maskTyping("5.", 2, false).text, "5.", "a separator typed after one digit is kept");
  equal(date.maskTyping("5.", 2, false).caret, 2, "with the caret after it");

  // Backspace. Without the deleting flag the mask re-adds the separator the
  // user just erased and the field can never be emptied.
  equal(date.maskTyping("05.03", 5, true).text, "05.03", "deleting adds no separator back");
  equal(date.maskTyping("05.", 3, true).text, "05", "a separator can be deleted");
  equal(date.maskTyping("0", 1, true).text, "0", "and so can everything else");
  equal(date.maskTyping("", 0, true).text, "", "down to nothing");

  // Correcting a group in a date already typed: select its two digits and type
  // two more. The caret has to stay where the work is happening — being thrown
  // to the end of the field is exactly what makes a mask hostile.
  const corrected = date.maskTyping("05.11.2026", 5, false);
  equal(corrected.text, "05.11.2026", "replacing a group leaves the rest of the date alone");
  equal(corrected.caret, 6, "and a group that has just filled up hands the caret to the next");
  equal(
    date.maskTyping("05.13.2026", 4, false).caret,
    4,
    "a group with room left keeps it, so the second digit lands where it was aimed",
  );

  // A ninth digit pushed into the middle of a full date has to go somewhere.
  // The separators the user typed are honoured and what no longer fits is
  // dropped, rather than every digit shifting one place along — both results
  // are wrong, and only one of them looks like a date that might be right.
  const overflowed = date.maskTyping("015.03.2026", 2, false);
  equal(date.fromDisplay(overflowed.text), null, "an overflowed date does not become a valid one");
  ok(overflowed.caret <= 3, "and the caret is still beside the digit that was typed");

  equal(date.maskTyping("abc", 3, false).text, "", "letters are not dates");
  equal(date.maskTyping("050320261234", 12, false).text, "05.03.2026", "and neither is a ninth digit");

  /* ------------------------------------------------------------------ *
   * Names come from Intl, and are Turkish. Asserted here because src/ is
   * forbidden from containing the letters this checks for.
   * ------------------------------------------------------------------ */

  equal(date.monthYearLabel("2026-03-05"), "Mart 2026", "the month heading is Turkish");
  equal(date.longDateLabel("2026-03-05"), "5 Mart 2026", "so is a whole spoken date");

  const weekdays = date.weekdayLabels();
  equal(weekdays.length, 7, "seven columns");
  equal(weekdays[0].long, "Pazartesi", "the week starts on Monday");
  equal(weekdays[6].long, "Pazar", "and ends on Sunday");
  ok(
    weekdays.every((day) => day.short.length > 0) &&
      new Set(weekdays.map((day) => day.short)).size === 7,
    "every column heading is distinct",
  );

  /* ------------------------------------------------------------------ *
   * The grid.
   * ------------------------------------------------------------------ */

  const march = date.monthGrid("2026-03-17");
  equal(march.length, 6, "six rows, so paging does not resize the calendar");
  ok(
    march.every((week) => week.length === 7),
    "seven days a week",
  );
  // 1 March 2026 is a Sunday, so a Monday-first grid opens on 23 February.
  equal(march[0][0], "2026-02-23", "the grid starts on the Monday before the 1st");
  equal(march[5][6], "2026-04-05", "and runs on into the next month");
  ok(
    march.flat().every((day, index, all) => index === 0 || day === date.addDays(all[index - 1], 1)),
    "the days are contiguous",
  );

  equal(date.addMonths("2026-01-31", 1), "2026-02-28", "a month after 31 January is 28 February");
  equal(date.addMonths("2024-01-31", 1), "2024-02-29", "or 29 February in a leap year");
  equal(date.addMonths("2026-01-15", -1), "2025-12-15", "paging back crosses the new year");
  equal(date.addMonths("2026-12-15", 1), "2027-01-15", "and paging forward crosses it too");
  equal(date.addDays("2026-02-28", 1), "2026-03-01", "February ends when it ends");
  equal(date.addDays("2024-02-28", 1), "2024-02-29", "except in a leap year");

  /* ------------------------------------------------------------------ *
   * Timezones. The same assertions, from four places on the globe.
   * ------------------------------------------------------------------ */

  const ZONES = [
    "Europe/Istanbul",
    "America/Los_Angeles",
    // The extremes, where an hour of drift is guaranteed to change the day.
    "Pacific/Kiritimati", // UTC+14
    "Pacific/Midway", // UTC-11
  ];

  for (const zone of ZONES) {
    process.env.TZ = zone;

    // The zone really did change. Without this the loop could pass four times
    // over in one timezone and prove nothing at all.
    const offsets = new Set(ZONES.map((other) => {
      process.env.TZ = other;
      return new Date(2026, 5, 15).getTimezoneOffset();
    }));
    process.env.TZ = zone;
    ok(offsets.size > 1, `the runtime honours process.env.TZ (checking ${zone})`);

    let day = "2026-01-01";
    let stable = true;
    while (day <= "2026-12-31" && stable) {
      const parsed = date.fromIso(day);
      if (!parsed || date.toIso(parsed) !== day) {
        stable = false;
        failures += 1;
        console.error(`  FAIL  ${zone}: ${day} did not survive Date and back`);
        break;
      }
      if (date.addDays(date.addDays(day, 1), -1) !== day) {
        stable = false;
        failures += 1;
        console.error(`  FAIL  ${zone}: ${day} moved when a day was added and taken away`);
        break;
      }
      day = date.addDays(day, 1);
    }
    ok(stable && day === "2027-01-01", `${zone}: every day of 2026 is timezone-independent`);

    equal(
      date.todayIso(new Date(2026, 2, 5, 0, 0, 0)),
      "2026-03-05",
      `${zone}: a moment just after midnight is still that day`,
    );
    equal(
      date.todayIso(new Date(2026, 2, 5, 23, 59, 59)),
      "2026-03-05",
      `${zone}: and so is a moment just before the next one`,
    );
    equal(date.monthGrid("2026-03-17")[0][0], "2026-02-23", `${zone}: the grid does not shift`);
  }

  // The trap these guard against is real rather than theoretical: the obvious
  // implementation is wrong in Istanbul, which is where this product runs.
  process.env.TZ = "Europe/Istanbul";
  const naive = new Date("2026-03-05T00:00:00").toISOString().slice(0, 10);
  ok(
    naive !== "2026-03-05",
    "the naive local-parse-then-toISOString round trip really does lose a day here",
  );

  process.env.TZ = "Europe/Istanbul";
} finally {
  await server.close();
}

if (failures > 0) {
  console.error(`\n${failures} of ${checks} date checks failed`);
} else {
  console.log(`All ${checks} date checks pass, in four timezones`);
}

process.exit(failures > 0 ? 1 : 0);
