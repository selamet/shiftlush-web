import { describe, expect, it } from "vitest";
import { initialAddressState } from "@/lib/address-select-state";

describe("initialAddressState", () => {
  it("opens all three levels when the ids are given", () => {
    expect(
      initialAddressState({
        provinceId: 34,
        provinceName: "Istanbul",
        districtId: 449,
        districtName: "Kadikoy",
        neighborhoodId: 9001,
        neighborhoodName: "Cumhuriyet",
      }),
    ).toEqual({
      provinceId: 34,
      districtId: 449,
      neighborhoodId: 9001,
      districtLabel: "Kadikoy",
      neighborhoodLabel: "Cumhuriyet",
    });
  });

  it("keeps the old label when only names are given", () => {
    expect(
      initialAddressState({
        provinceName: "Istanbul",
        districtName: "Kadikoy",
        neighborhoodId: 9001,
      }),
    ).toEqual({
      provinceId: null,
      districtId: null,
      neighborhoodId: 9001,
      districtLabel: "",
      neighborhoodLabel: "Istanbul · Kadikoy",
    });
  });

  it("leaves everything empty and unlocked for an address with no neighbourhood", () => {
    expect(
      initialAddressState({ provinceName: null, districtName: null, neighborhoodId: null }),
    ).toEqual({
      provinceId: null,
      districtId: null,
      neighborhoodId: null,
      districtLabel: "",
      neighborhoodLabel: "",
    });
  });

  it("is the empty state when nothing is passed", () => {
    expect(initialAddressState(undefined).neighborhoodId).toBeNull();
  });
});
