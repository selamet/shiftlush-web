/**
 * What the maintenance visit form sends, and when it lets it be sent.
 *
 * A visit recorded as complete is a statement that sixteen things were looked
 * at by a named person on a named day. The two ways this goes wrong are both
 * silent: the form lets a complete visit through with rows nobody answered,
 * or it sends something the person never saw on screen — a note under a row
 * they changed their mind about, their own id where the server expects
 * nothing. Neither shows up in a render; both show up in a record somebody
 * relies on later.
 */
import { describe, expect, it } from "vitest";
import {
  CHECKLIST_ITEMS,
  answeredCount,
  attentionCount,
  buildVisitBody,
  firstUnanswered,
  submitBlocker,
  type Checklist,
  type VisitFormState,
} from "@/lib/visit";
import { uploadRefusal } from "@/lib/upload";

/** Every row answered "OK" — the shape of an uneventful visit. */
function allOk(): Checklist {
  return Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item, { result: "ok", note: "" }]));
}

function state(overrides: Partial<VisitFormState> = {}): VisitFormState {
  return {
    elevatorId: "e1",
    contractId: "k1",
    role: "owner",
    technicianId: "u3",
    visitDate: "2026-10-20",
    status: "completed",
    checklist: {},
    ...overrides,
  };
}

describe("the checklist counter", () => {
  it("counts nothing on a fresh form, because nothing is preselected", () => {
    expect(answeredCount({})).toBe(0);
    expect(firstUnanswered({})).toBe("brake_system");
  });

  it("counts the answered rows whatever the answer", () => {
    const checklist: Checklist = {
      brake_system: { result: "ok", note: "" },
      hoisting_ropes: { result: "attention_needed", note: "worn" },
      pit_condition: { result: "not_applicable", note: "" },
    };
    expect(answeredCount(checklist)).toBe(3);
    expect(firstUnanswered(checklist)).toBe("landing_doors");
  });

  it("has no first unanswered row once all sixteen are answered", () => {
    expect(answeredCount(allOk())).toBe(16);
    expect(firstUnanswered(allOk())).toBeNull();
  });
});

describe("whether the form can be sent", () => {
  it("holds a completed visit until every row is answered, and says how many remain", () => {
    const checklist = allOk();
    delete checklist.earthing_grounding;
    delete checklist.brake_system;
    expect(submitBlocker("completed", checklist)).toEqual({ missing: 2 });
    expect(submitBlocker("completed", {})).toEqual({ missing: 16 });
  });

  it("lets a completed visit through once all sixteen are answered", () => {
    expect(submitBlocker("completed", allOk())).toBeNull();
  });

  it("never demands answers for a visit that was cut short or never got in", () => {
    expect(submitBlocker("incomplete", {})).toBeNull();
    expect(submitBlocker("access_denied", {})).toBeNull();
  });
});

describe("the request body", () => {
  it("sends the facts the screen holds and the answers in checklist order", () => {
    const body = buildVisitBody(
      state({
        checklist: {
          pit_condition: { result: "ok", note: "" },
          brake_system: { result: "attention_needed", note: "  pads worn  " },
        },
      }),
    );
    expect(body).toEqual({
      elevator: "e1",
      contract: "k1",
      technician: "u3",
      visit_date: "2026-10-20",
      status: "completed",
      items: [
        { item: "brake_system", result: "attention_needed", note: "pads worn" },
        { item: "pit_condition", result: "ok", note: "" },
      ],
    });
  });

  it("leaves the technician out for a technician, whatever the field held", () => {
    const body = buildVisitBody(state({ role: "technician", technicianId: "someone-else" }));
    expect(body).not.toHaveProperty("technician");
  });

  it("sends only the note that was visible: under an attention row", () => {
    const body = buildVisitBody(
      state({ checklist: { brake_system: { result: "ok", note: "typed, then changed to OK" } } }),
    );
    expect(body.items).toEqual([{ item: "brake_system", result: "ok", note: "" }]);
  });

  it("drops a reason typed for another status once the visit is back to completed", () => {
    expect(buildVisitBody(state({ statusNote: "locked" }))).not.toHaveProperty("status_note");
    expect(buildVisitBody(state({ status: "access_denied", statusNote: " locked " }))).toMatchObject(
      { status: "access_denied", status_note: "locked" },
    );
  });

  it("leaves blank text out rather than sending empty strings", () => {
    const body = buildVisitBody(state({ workNotes: "   ", partsReplaced: "", technicianId: "" }));
    expect(body).not.toHaveProperty("work_notes");
    expect(body).not.toHaveProperty("parts_replaced");
    expect(body).not.toHaveProperty("technician");
  });

  it("omits the checklist entirely when no row was answered", () => {
    expect(buildVisitBody(state({ status: "incomplete" }))).not.toHaveProperty("items");
  });

  it("builds the same body for the same answers whatever order they were tapped in", () => {
    const one = buildVisitBody(
      state({
        checklist: {
          limit_switches: { result: "ok", note: "" },
          car_lighting: { result: "not_applicable", note: "" },
        },
      }),
    );
    const two = buildVisitBody(
      state({
        checklist: {
          car_lighting: { result: "not_applicable", note: "" },
          limit_switches: { result: "ok", note: "" },
        },
      }),
    );
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });
});

describe("the rows that need attention", () => {
  it("counts only attention_needed", () => {
    expect(
      attentionCount([
        { result: "ok" },
        { result: "attention_needed" },
        { result: "not_applicable" },
        { result: "attention_needed" },
      ]),
    ).toBe(2);
    expect(attentionCount([])).toBe(0);
  });
});

describe("which photos are worth sending", () => {
  const photoTypes = ["image/jpeg", "image/png", "image/webp"];

  it("refuses a type the server would refuse, before the transfer", () => {
    expect(uploadRefusal({ type: "image/heic", size: 1000 }, photoTypes)).toBe("type");
    expect(uploadRefusal({ type: "application/pdf", size: 1000 }, photoTypes)).toBe("type");
  });

  it("refuses a file over the server's ceiling", () => {
    expect(uploadRefusal({ type: "image/jpeg", size: 11 * 1024 * 1024 }, photoTypes)).toBe(
      "tooLarge",
    );
  });

  it("lets an ordinary phone photo through", () => {
    expect(uploadRefusal({ type: "image/jpeg", size: 3 * 1024 * 1024 }, photoTypes)).toBeNull();
  });
});
