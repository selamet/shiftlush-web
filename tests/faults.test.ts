/**
 * What the fault screens offer, and what they say happened.
 *
 * The actions decide whether a technician standing at a lift with somebody
 * trapped in it can record that they arrived; the timeline is what the office
 * reads to answer "when did we get there"; the priority mapping is what a
 * resident's two checkboxes turn into. All three are checked here against
 * plain values.
 */
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { Fault } from "@/api/queries";
import i18n from "@/lib/i18n";
import {
  availableActions,
  boardOrder,
  faultTimeline,
  formatDuration,
  publicPriority,
  responseSeconds,
  staffPriority,
} from "@/lib/faults";

const t = i18n.t as unknown as TFunction;

function fault(overrides: Partial<Fault> = {}): Fault {
  return {
    id: "f1",
    reference: "ABC123",
    elevator: "e1",
    elevator_name: "Sol asansör",
    building: "b1",
    building_name: "A Blok",
    customer: "c1",
    customer_name: "Dadaş",
    channel: "staff",
    reported_by: "u1",
    reported_by_name: "Mehmet Yılmaz",
    reporter_name: "",
    reporter_phone: "",
    description: "Kapı kapanmıyor",
    additional_reports: [],
    priority: "normal",
    status: "open",
    technician: null,
    technician_name: null,
    stopped_elevator: false,
    reported_at: "2026-10-20T08:00:00Z",
    assigned_at: null,
    on_site_at: null,
    resolved_at: null,
    closed_at: null,
    cancelled_at: null,
    cancel_reason: "",
    resolution_notes: "",
    parts_used: "",
    billable: null,
    billable_overridden: false,
    response_time_seconds: null,
    resolution_time_seconds: null,
    created_at: "2026-10-20T08:00:00Z",
    updated_at: "2026-10-20T08:00:00Z",
    ...overrides,
  };
}

describe("availableActions", () => {
  it("lets the office assign and cancel an open fault, and correct it", () => {
    expect(availableActions(fault(), "operations", "u4")).toEqual(["assign", "cancel", "edit"]);
  });

  it("lets the office record every step on a technician's behalf", () => {
    expect(availableActions(fault({ status: "assigned", technician: "u3" }), "owner", "u1")).toEqual([
      "assign",
      "arrive",
      "cancel",
      "edit",
    ]);
    expect(availableActions(fault({ status: "on_site" }), "admin", "u2")).toContain("resolve");
    expect(availableActions(fault({ status: "resolved" }), "admin", "u2")).toEqual(["close", "edit"]);
  });

  it("gives the assigned technician arrive, then resolve — and nothing else", () => {
    expect(availableActions(fault({ status: "assigned", technician: "u3" }), "technician", "u3")).toEqual([
      "arrive",
    ]);
    expect(availableActions(fault({ status: "on_site", technician: "u3" }), "technician", "u3")).toEqual([
      "resolve",
    ]);
  });

  it("gives another technician nothing, and nobody anything on a finished fault", () => {
    expect(availableActions(fault({ status: "assigned", technician: "u9" }), "technician", "u3")).toEqual(
      [],
    );
    expect(availableActions(fault({ status: "closed" }), "owner", "u1")).toEqual([]);
    expect(availableActions(fault({ status: "cancelled" }), "owner", "u1")).toEqual([]);
    expect(availableActions(fault(), "accountant", "u5")).toEqual([]);
  });
});

describe("faultTimeline", () => {
  it("lists only what happened, with who, in time order", () => {
    const steps = faultTimeline(
      fault({
        status: "resolved",
        technician_name: "Hakan Çelik",
        assigned_at: "2026-10-20T08:05:00Z",
        on_site_at: "2026-10-20T08:40:00Z",
        resolved_at: "2026-10-20T09:10:00Z",
      }),
    );
    expect(steps).toEqual([
      { step: "reported", at: "2026-10-20T08:00:00Z", who: "Mehmet Yılmaz" },
      { step: "assigned", at: "2026-10-20T08:05:00Z", who: "Hakan Çelik" },
      { step: "on_site", at: "2026-10-20T08:40:00Z", who: "Hakan Çelik" },
      { step: "resolved", at: "2026-10-20T09:10:00Z", who: "Hakan Çelik" },
    ]);
  });

  it("names a resident who left their name, and nobody when they did not", () => {
    const named = faultTimeline(
      fault({ channel: "public_qr", reported_by: null, reported_by_name: null, reporter_name: "Ayşe" }),
    );
    expect(named[0].who).toBe("Ayşe");
    const anonymous = faultTimeline(
      fault({ channel: "public_qr", reported_by: null, reported_by_name: null }),
    );
    expect(anonymous[0].who).toBeNull();
  });

  it("ends a cancelled fault at its cancellation", () => {
    const steps = faultTimeline(fault({ status: "cancelled", cancelled_at: "2026-10-20T08:02:00Z" }));
    expect(steps.map((entry) => entry.step)).toEqual(["reported", "cancelled"]);
  });
});

describe("responseSeconds", () => {
  const now = Date.parse("2026-10-20T08:45:30Z");

  it("runs from the report until somebody arrives", () => {
    expect(responseSeconds(fault(), now)).toBe(45 * 60 + 30);
  });

  it("is the server's figure once they have", () => {
    expect(responseSeconds(fault({ status: "on_site", response_time_seconds: 2400 }), now)).toBe(2400);
  });

  it("stops counting for a cancelled fault", () => {
    expect(responseSeconds(fault({ status: "cancelled" }), now)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("reads as minutes, hours and minutes, or days and hours", () => {
    expect(formatDuration(30, t)).toBe(t("fault.duration.underMinute"));
    expect(formatDuration(12 * 60, t)).toBe("12 dk");
    expect(formatDuration(2 * 3600 + 5 * 60, t)).toBe("2 sa 5 dk");
    expect(formatDuration(26 * 3600, t)).toBe("1 gün 2 sa");
    expect(formatDuration(null, t)).toBe("");
  });
});

describe("boardOrder", () => {
  it("puts emergencies first, then the longest waiting", () => {
    const rows = [
      fault({ id: "n-old", priority: "normal", reported_at: "2026-10-20T07:00:00Z" }),
      fault({ id: "e-new", priority: "emergency", reported_at: "2026-10-20T08:30:00Z" }),
      fault({ id: "h", priority: "high", reported_at: "2026-10-20T08:00:00Z" }),
      fault({ id: "e-old", priority: "emergency", reported_at: "2026-10-20T08:10:00Z" }),
    ];
    expect([...rows].sort(boardOrder).map((row) => row.id)).toEqual(["e-old", "e-new", "h", "n-old"]);
  });
});

describe("priorities", () => {
  it("turns a resident's answers into the priority the server will record", () => {
    expect(publicPriority({ someoneTrapped: true, elevatorStopped: false })).toBe("emergency");
    expect(publicPriority({ someoneTrapped: true, elevatorStopped: true })).toBe("emergency");
    expect(publicPriority({ someoneTrapped: false, elevatorStopped: true })).toBe("high");
    expect(publicPriority({ someoneTrapped: false, elevatorStopped: false })).toBe("normal");
  });

  it("makes a staff report with somebody trapped an emergency whatever was chosen", () => {
    expect(staffPriority("normal", true)).toBe("emergency");
    expect(staffPriority("high", false)).toBe("high");
  });
});
