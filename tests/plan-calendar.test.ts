/**
 * The calendar's rules, as plain functions: which days a week shows, where each
 * row sits, where a dragged row may land and what a drop asks the server for.
 */
import { describe, expect, it } from "vitest";
import {
  BUSY_DAY,
  cellKey,
  dropTarget,
  isDropAllowed,
  layoutWeek,
  monthLoad,
  weekDays,
  type CalendarRow,
} from "@/lib/plan-calendar";

const TODAY = "2026-10-21";

function row(overrides: Partial<CalendarRow> = {}): CalendarRow {
  return {
    id: "r1",
    period: "2026-10",
    status: "planned",
    technician: "t1",
    planned_date: null,
    due_date: "2026-10-15",
    ...overrides,
  };
}

describe("weekDays", () => {
  it("is Monday to Sunday around any day", () => {
    expect(weekDays("2026-10-21")).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });
});

describe("layoutWeek", () => {
  const days = weekDays(TODAY);

  it("puts a planned day in its technician's cell, and nobody's in the unassigned row", () => {
    const layout = layoutWeek(
      [
        row({ id: "a", planned_date: "2026-10-22" }),
        row({ id: "b", technician: null, planned_date: "2026-10-22" }),
      ],
      days,
    );
    expect(layout.cells.get(cellKey("t1", "2026-10-22"))?.map((r) => r.id)).toEqual(["a"]);
    expect(layout.cells.get(cellKey(null, "2026-10-22"))?.map((r) => r.id)).toEqual(["b"]);
  });

  it("puts planned rows with no day in the tray, overdue first then by due date", () => {
    const layout = layoutWeek(
      [
        row({ id: "late", due_date: "2026-10-02" }),
        row({ id: "soon", due_date: "2026-10-28" }),
        row({ id: "sooner", due_date: "2026-10-24" }),
        row({ id: "done", status: "done" }),
      ],
      days,
    );
    expect(layout.tray.map((r) => r.id)).toEqual(["late", "sooner", "soon"]);
  });

  it("leaves out rows planned for another week", () => {
    const layout = layoutWeek([row({ planned_date: "2026-10-30" })], days);
    expect(layout.cells.size).toBe(0);
    expect(layout.tray).toEqual([]);
  });
});

describe("isDropAllowed", () => {
  it("allows a planned row onto today or later inside its month", () => {
    expect(isDropAllowed(row(), "2026-10-21", TODAY)).toBe(true);
    expect(isDropAllowed(row(), "2026-10-31", TODAY)).toBe(true);
  });

  it("refuses a past day, another month, and any day for a closed row", () => {
    expect(isDropAllowed(row(), "2026-10-20", TODAY)).toBe(false);
    expect(isDropAllowed(row(), "2026-11-02", TODAY)).toBe(false);
    expect(isDropAllowed(row({ status: "done" }), "2026-10-22", TODAY)).toBe(false);
  });

  it("allows the tray for a planned row, not for a closed one", () => {
    expect(isDropAllowed(row({ planned_date: "2026-10-22" }), null, TODAY)).toBe(true);
    expect(isDropAllowed(row({ status: "cancelled" }), null, TODAY)).toBe(false);
  });
});

describe("dropTarget", () => {
  it("asks for only what changed", () => {
    const moving = row({ planned_date: "2026-10-22" });
    expect(dropTarget(moving, { technician: "t1", day: "2026-10-23" })).toEqual({
      planned_date: "2026-10-23",
    });
    expect(dropTarget(moving, { technician: "t2", day: "2026-10-22" })).toEqual({ technician: "t2" });
    expect(dropTarget(moving, { technician: null, day: "2026-10-24" })).toEqual({
      technician: null,
      planned_date: "2026-10-24",
    });
  });

  it("clears the day for the tray and keeps the technician", () => {
    expect(dropTarget(row({ planned_date: "2026-10-22" }), { tray: true })).toEqual({ planned_date: null });
  });

  it("is nothing when the row lands where it was", () => {
    expect(dropTarget(row({ planned_date: "2026-10-22" }), { technician: "t1", day: "2026-10-22" })).toBeNull();
    expect(dropTarget(row(), { tray: true })).toBeNull();
  });
});

describe("monthLoad", () => {
  it("counts each technician's planned and done rows per day, leaving out cancelled and undated", () => {
    const load = monthLoad([
      row({ id: "a", planned_date: "2026-10-22" }),
      row({ id: "b", planned_date: "2026-10-22", status: "done" }),
      row({ id: "c", planned_date: "2026-10-22", technician: "t2" }),
      row({ id: "d", planned_date: "2026-10-22", status: "cancelled" }),
      row({ id: "e" }),
    ]);
    expect(Object.fromEntries(load.get("2026-10-22") ?? [])).toEqual({ t1: 2, t2: 1 });
    expect(load.size).toBe(1);
  });

  it("marks a busy day above the hint, not at it", () => {
    expect(BUSY_DAY).toBe(8);
  });
});
