/**
 * What an inspection label means, mirrored from the server's rules table.
 *
 * The server decides every deadline (apps/inspections/rules.py, from the
 * lift inspection regulation — RG 30411 as amended by RG 31952). This file
 * exists for one thing the server cannot do: tell the person filling in the
 * form what the label they are about to record will mean — the date the
 * defects must be fixed by, and whether missing it gets the lift sealed —
 * before they press save. The preview is a courtesy; the saved record carries
 * the server's own date, and that is what every other screen shows.
 *
 * Kept as a table, like the server's, so an amendment is one row here and one
 * row there, and the unit suite checks this table against the same values the
 * server's tests do.
 */
import type { InspectionKind, InspectionResultLabel } from "@/api/enums";
import { allOf } from "@/api/enums";
import type { Role } from "@/components/layout/nav-config";
import { addDays, isIsoDate } from "@/lib/date";

export const INSPECTION_LABELS = allOf<InspectionResultLabel>()(["green", "blue", "yellow", "red"]);
export const INSPECTION_KINDS = allOf<InspectionKind>()(["periodic", "follow_up"]);

type Deadline = "none" | "days" | "next_inspection";

interface LabelRule {
  /** Whether the regulation lets the lift run under this label. */
  usable: boolean;
  deadline: Deadline;
  /** For a "days" deadline: how many, counted from the original periodic inspection. */
  days: number | null;
  /** Whether missing the deadline gets the lift sealed by the municipality. */
  sealedIfMissed: boolean;
}

/** The server's RULES, row for row. */
export const LABEL_RULES: Record<InspectionResultLabel, LabelRule> = {
  green: { usable: true, deadline: "none", days: null, sealedIfMissed: false },
  blue: { usable: true, deadline: "next_inspection", days: null, sealedIfMissed: false },
  yellow: { usable: true, deadline: "days", days: 120, sealedIfMissed: true },
  red: { usable: false, deadline: "days", days: 60, sealedIfMissed: true },
};

/**
 * A year after the inspection, the 29th of February landing on the 28th — the
 * server's `default_next_inspection`, done on the string so no timezone can
 * move the day.
 */
export function defaultNextInspection(inspectedOn: string): string {
  if (!isIsoDate(inspectedOn)) return "";
  const [year, month, day] = inspectedOn.split("-");
  const next = String(Number(year) + 1).padStart(4, "0");
  const candidate = `${next}-${month}-${day}`;
  return isIsoDate(candidate) ? candidate : `${next}-${month}-28`;
}

export interface DeadlineInput {
  label: InspectionResultLabel | undefined;
  kind: InspectionKind;
  inspectedOn: string;
  /** For a follow-up: the periodic inspection it follows. */
  follows?: { inspected_on: string; next_inspection_due: string } | null;
  /** What the form will send, or "" to leave it to the server's default. */
  nextInspectionDue?: string;
}

export interface DeadlinePreview {
  /** The day the defects must be fixed by, or null when the label needs no correction. */
  deadline: string | null;
  /** What the deadline is measured against — said beside the date on the form. */
  basis: Deadline;
  days: number | null;
  /** The day the "days" are counted from — the original inspection's. */
  countedFrom: string | null;
  usable: boolean;
  sealedIfMissed: boolean;
}

/**
 * The correction deadline the server will derive for this inspection.
 *
 * Two rules from the regulation carry the logic. There are no extensions, so a
 * follow-up never restarts the clock: its days count from the original
 * periodic inspection it follows. And a red lift that a follow-up turns yellow
 * gets the yellow row counted from that same original date — 120 days from the
 * first inspection, not from the follow-up — which is simply the first rule
 * applied to the yellow row.
 *
 * Blue is "by the next periodic inspection": the date the form will send, or,
 * left blank, the server's default — a year on for a periodic inspection, and
 * for a follow-up the date the inspection it follows already set.
 */
export function previewCorrectionDeadline(input: DeadlineInput): DeadlinePreview | null {
  if (!input.label || !isIsoDate(input.inspectedOn)) return null;
  const rule = LABEL_RULES[input.label];
  const followUp = input.kind === "follow_up";
  if (followUp && !input.follows) return null;

  const countedFrom = followUp && input.follows ? input.follows.inspected_on : input.inspectedOn;
  const nextDue =
    input.nextInspectionDue && isIsoDate(input.nextInspectionDue)
      ? input.nextInspectionDue
      : followUp && input.follows
        ? input.follows.next_inspection_due
        : defaultNextInspection(input.inspectedOn);

  const deadline =
    rule.deadline === "days" && rule.days !== null
      ? addDays(countedFrom, rule.days)
      : rule.deadline === "next_inspection"
        ? nextDue
        : null;

  return {
    deadline,
    basis: rule.deadline,
    days: rule.days,
    countedFrom: rule.deadline === "days" ? countedFrom : null,
    usable: rule.usable,
    sealedIfMissed: rule.sealedIfMissed,
  };
}

/**
 * The sealing risk the due list flags: a correction deadline that has passed
 * while the label is one the municipality seals for. Said in words on the row,
 * because it is the single outcome this whole module exists to prevent.
 */
export function atSealingRisk(item: { type: string; days_left: number; sealed_if_missed: boolean }): boolean {
  return item.type === "correction" && item.sealed_if_missed && item.days_left < 0;
}

/** Who records and corrects inspections — the server's matrix. */
export function canRecordInspections(role: Role | null): boolean {
  return role === "owner" || role === "admin" || role === "operations";
}

/** Who reads them: the office, and technicians (narrowed to their customers). */
export function canReadInspections(role: Role | null): boolean {
  return canRecordInspections(role) || role === "technician";
}

/** The windows the due list offers, in days. */
export const DUE_WINDOWS = [30, 60, 90] as const;
export const DEFAULT_DUE_WINDOW = 60;

/**
 * The request behind an elevator's inspection history — newest first, and
 * enough of them to show the chain a follow-up belongs to. Shared with the
 * elevator route's prefetch, which is why it lives here.
 */
export function elevatorInspectionParams(elevatorId: string) {
  return { elevator: elevatorId, ordering: "-inspected_on", page_size: 20 };
}
