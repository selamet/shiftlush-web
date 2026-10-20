/**
 * The elevator form never sends the inspection fields.
 *
 * They belong to the inspection records now, and the server refuses a create
 * or an edit that carries any of them — so a single one slipping into the body
 * breaks saving an elevator outright. Checked twice: no field spec renders an
 * input for one (an input is a value in FormData), and the body builder drops
 * them even if something else put them there.
 */
import { describe, expect, it } from "vitest";
import { ALL_FIELDS, READ_ONLY_FIELDS, elevatorWriteBody } from "@/screens/elevator-form-fields";

describe("the elevator request body", () => {
  it("has no input for any inspection field", () => {
    const rendered = new Set(ALL_FIELDS.map((field) => field.name));
    for (const name of READ_ONLY_FIELDS) expect(rendered.has(name)).toBe(false);
  });

  it("drops the inspection fields even when the form collected them", () => {
    const body = elevatorWriteBody(
      {
        building: "b1",
        name: "Sol asansör",
        inspection_label: "green",
        last_inspection_date: "2026-03-14",
        next_inspection_date: "2027-03-14",
        inspection_body: "TÜV Austria Türk",
        inspection_report_number: "PK-2026-18442",
      },
      true,
    );
    expect(body).toEqual({ building: "b1", name: "Sol asansör", has_car_door: true });
    for (const name of READ_ONLY_FIELDS) expect(body).not.toHaveProperty(name);
  });

  it("sends a missing car door as false, not as absent", () => {
    expect(elevatorWriteBody({ building: "b1" }, false)).toEqual({ building: "b1", has_car_door: false });
  });
});
