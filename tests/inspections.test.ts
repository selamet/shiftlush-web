/**
 * The correction deadline the inspection form previews, against the same
 * table the server's rules.py encodes: red 60 days, yellow 120, blue by the
 * next periodic inspection, green nothing — and a follow-up counting from the
 * original inspection, never from itself.
 */
import { describe, expect, it } from "vitest";
import {
  LABEL_RULES,
  atSealingRisk,
  defaultNextInspection,
  previewCorrectionDeadline,
} from "@/lib/inspections";

describe("the rules table", () => {
  it("matches the regulation row for row", () => {
    expect(LABEL_RULES.red).toEqual({ usable: false, deadline: "days", days: 60, sealedIfMissed: true });
    expect(LABEL_RULES.yellow).toEqual({ usable: true, deadline: "days", days: 120, sealedIfMissed: true });
    expect(LABEL_RULES.blue).toEqual({ usable: true, deadline: "next_inspection", days: null, sealedIfMissed: false });
    expect(LABEL_RULES.green).toEqual({ usable: true, deadline: "none", days: null, sealedIfMissed: false });
  });
});

describe("previewCorrectionDeadline", () => {
  it("gives red 60 days and yellow 120 from a periodic inspection", () => {
    expect(
      previewCorrectionDeadline({ label: "red", kind: "periodic", inspectedOn: "2026-03-14" }),
    ).toMatchObject({ deadline: "2026-05-13", basis: "days", days: 60, sealedIfMissed: true, usable: false });
    expect(
      previewCorrectionDeadline({ label: "yellow", kind: "periodic", inspectedOn: "2026-03-14" }),
    ).toMatchObject({ deadline: "2026-07-12", days: 120, sealedIfMissed: true, usable: true });
  });

  it("gives blue the next periodic inspection — a year on by default, or what the form sends", () => {
    expect(
      previewCorrectionDeadline({ label: "blue", kind: "periodic", inspectedOn: "2026-03-14" })?.deadline,
    ).toBe("2027-03-14");
    expect(
      previewCorrectionDeadline({
        label: "blue",
        kind: "periodic",
        inspectedOn: "2026-03-14",
        nextInspectionDue: "2027-02-01",
      })?.deadline,
    ).toBe("2027-02-01");
  });

  it("gives green no deadline at all", () => {
    expect(
      previewCorrectionDeadline({ label: "green", kind: "periodic", inspectedOn: "2026-03-14" }),
    ).toMatchObject({ deadline: null, basis: "none", sealedIfMissed: false });
  });

  it("counts a follow-up's days from the original inspection — red turned yellow gets 120 from the first date", () => {
    const original = { inspected_on: "2026-03-14", next_inspection_due: "2027-03-14" };
    expect(
      previewCorrectionDeadline({ label: "yellow", kind: "follow_up", inspectedOn: "2026-05-01", follows: original }),
    ).toMatchObject({ deadline: "2026-07-12", countedFrom: "2026-03-14" });
    expect(
      previewCorrectionDeadline({ label: "red", kind: "follow_up", inspectedOn: "2026-04-20", follows: original })
        ?.deadline,
    ).toBe("2026-05-13");
  });

  it("gives a blue follow-up the date the original set for the next inspection", () => {
    expect(
      previewCorrectionDeadline({
        label: "blue",
        kind: "follow_up",
        inspectedOn: "2026-05-01",
        follows: { inspected_on: "2026-03-14", next_inspection_due: "2027-03-14" },
      })?.deadline,
    ).toBe("2027-03-14");
  });

  it("previews nothing until there is a label, a date, and for a follow-up what it follows", () => {
    expect(previewCorrectionDeadline({ label: undefined, kind: "periodic", inspectedOn: "2026-03-14" })).toBeNull();
    expect(previewCorrectionDeadline({ label: "red", kind: "periodic", inspectedOn: "" })).toBeNull();
    expect(previewCorrectionDeadline({ label: "red", kind: "follow_up", inspectedOn: "2026-05-01" })).toBeNull();
  });
});

describe("defaultNextInspection", () => {
  it("is a year on, and the 29th of February lands on the 28th", () => {
    expect(defaultNextInspection("2026-03-14")).toBe("2027-03-14");
    expect(defaultNextInspection("2028-02-29")).toBe("2029-02-28");
  });
});

describe("atSealingRisk", () => {
  it("flags a passed correction deadline on a label that gets sealed, and nothing else", () => {
    expect(atSealingRisk({ type: "correction", days_left: -2, sealed_if_missed: true })).toBe(true);
    expect(atSealingRisk({ type: "correction", days_left: 5, sealed_if_missed: true })).toBe(false);
    expect(atSealingRisk({ type: "inspection", days_left: -2, sealed_if_missed: false })).toBe(false);
  });
});
