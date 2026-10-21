/**
 * A red or yellow label's deadline, as the lift screens print it beside the
 * next periodic inspection.
 */
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import i18n from "@/lib/i18n";
import { correctionSummary } from "@/components/inspections/CorrectionDeadline";

const t = i18n.t as unknown as TFunction;

describe("correctionSummary", () => {
  it("gives the date and the days left", () => {
    expect(correctionSummary({ correction_deadline: "2026-11-12", correction_days_left: 21 }, t)).toBe(
      "12.11.2026 · 21 gün kaldı",
    );
  });

  it("says how long ago a passed deadline passed, and today on the day", () => {
    expect(correctionSummary({ correction_deadline: "2026-10-16", correction_days_left: -5 }, t)).toBe(
      "16.10.2026 · 5 gün geçti",
    );
    expect(correctionSummary({ correction_deadline: "2026-10-21", correction_days_left: 0 }, t)).toBe(
      "21.10.2026 · Bugün",
    );
  });

  it("is nothing when no defect is open", () => {
    expect(correctionSummary({ correction_deadline: null, correction_days_left: null }, t)).toBeNull();
  });
});
