/**
 * How a day's route is spoken of: the distance, roughly, and the way there.
 */
import { describe, expect, it } from "vitest";
import { directionsUrl, routeKm } from "@/lib/route";

describe("routeKm", () => {
  it("is one decimal with a comma, and nothing for no distance", () => {
    expect(routeKm(6.04)).toBe("6");
    expect(routeKm(12.36)).toBe("12,4");
    expect(routeKm(0)).toBe("");
  });
});

describe("directionsUrl", () => {
  it("asks the maps app for directions to the stop", () => {
    expect(directionsUrl("39.900000", "41.260000")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=39.900000%2C41.260000",
    );
  });

  it("is nothing without a whole position", () => {
    expect(directionsUrl(null, "41.26")).toBe("");
    expect(directionsUrl("39.9", null)).toBe("");
  });
});
