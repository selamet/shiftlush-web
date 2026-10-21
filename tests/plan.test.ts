/**
 * Which planned rows are a technician's today, and which are this week's.
 *
 * Get "today" wrong and a technician drives past a lift that was due, or is
 * sent to one that was moved to next week. The rules are about calendar days
 * only, so they are checked here against plain strings — including the two
 * edges that fail silently: a week that crosses a month end, and an undated
 * row that slipped past its due day.
 */
import { describe, expect, it } from "vitest";
import {
  homePath,
  isDueThisWeek,
  isDueToday,
  nextPeriod,
  overdueFilter,
  periodOf,
  periodsForWeek,
  previousPeriod,
  triedNotDone,
  weekRange,
  type PlanRow,
} from "@/lib/plan";

// A Tuesday.
const TODAY = "2026-10-20";

function row(overrides: Partial<PlanRow> = {}): PlanRow {
  return { due_date: "2026-10-25", planned_date: null, status: "planned", ...overrides };
}

describe("today's list", () => {
  it("holds a row planned for today, done or not", () => {
    expect(isDueToday(row({ planned_date: TODAY }), TODAY)).toBe(true);
    expect(isDueToday(row({ planned_date: TODAY, status: "done" }), TODAY)).toBe(true);
  });

  it("does not hold a row the office moved to another day, even if it is due", () => {
    expect(isDueToday(row({ due_date: "2026-10-15", planned_date: "2026-10-22" }), TODAY)).toBe(
      false,
    );
  });

  it("holds an undated row once it is due, and keeps it while it slips", () => {
    expect(isDueToday(row({ due_date: TODAY }), TODAY)).toBe(true);
    expect(isDueToday(row({ due_date: "2026-10-02" }), TODAY)).toBe(true);
    expect(isDueToday(row({ due_date: "2026-10-21" }), TODAY)).toBe(false);
  });

  it("drops an undated row once it is done, and never holds a cancelled one", () => {
    expect(isDueToday(row({ due_date: "2026-10-02", status: "done" }), TODAY)).toBe(false);
    expect(isDueToday(row({ planned_date: TODAY, status: "cancelled" }), TODAY)).toBe(false);
  });
});

describe("this week's list", () => {
  it("runs Monday to Sunday", () => {
    expect(weekRange(TODAY)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    // A Sunday belongs to the week that started six days earlier.
    expect(weekRange("2026-10-25")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(weekRange("2026-10-26")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
  });

  it("holds rows due this week, and everything on today's list", () => {
    expect(isDueThisWeek(row({ due_date: "2026-10-25" }), TODAY)).toBe(true);
    expect(isDueThisWeek(row({ due_date: "2026-10-02" }), TODAY)).toBe(true);
    expect(isDueThisWeek(row({ due_date: "2026-10-26" }), TODAY)).toBe(false);
  });

  it("goes by the planned date when the office set one", () => {
    expect(isDueThisWeek(row({ due_date: "2026-10-23", planned_date: "2026-10-27" }), TODAY)).toBe(
      false,
    );
    expect(isDueThisWeek(row({ due_date: "2026-10-30", planned_date: "2026-10-21" }), TODAY)).toBe(
      true,
    );
  });

  it("never holds a cancelled row", () => {
    expect(isDueThisWeek(row({ status: "cancelled" }), TODAY)).toBe(false);
  });

  it("asks for both months when the week crosses a month end", () => {
    expect(periodsForWeek(TODAY)).toEqual(["2026-10"]);
    expect(periodsForWeek("2026-10-29")).toEqual(["2026-10", "2026-11"]);
  });
});

describe("periods", () => {
  it("reads the month off a day, and steps a month either way across a year end", () => {
    expect(periodOf(TODAY)).toBe("2026-10");
    expect(nextPeriod("2026-12")).toBe("2027-01");
    expect(nextPeriod("2026-01")).toBe("2026-02");
    expect(previousPeriod("2027-01")).toBe("2026-12");
  });
});

describe("rows that stand out", () => {
  it("narrows to overdue as planned and due before today — inclusive, so yesterday", () => {
    expect(overdueFilter(TODAY)).toEqual({ status: "planned", due_before: "2026-10-19" });
  });

  it("marks a row somebody tried and could not finish", () => {
    expect(triedNotDone(row({ latest_visit_status: "access_denied" }))).toBe(true);
    expect(triedNotDone(row({ latest_visit_status: null }))).toBe(false);
    expect(triedNotDone(row({ status: "done", latest_visit_status: "completed" }))).toBe(false);
  });
});

describe("homePath", () => {
  it("sends a technician to today's list, an accountant to billing, and everybody else to the lifts", () => {
    expect(homePath("technician")).toBe("/today");
    expect(homePath("owner")).toBe("/elevators");
    expect(homePath("accountant")).toBe("/billing");
    expect(homePath(null)).toBe("/elevators");
  });
});
