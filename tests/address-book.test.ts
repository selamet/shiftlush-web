/**
 * The saved-address picker's rules: what it offers and what a pick fills in.
 */
import { describe, expect, it } from "vitest";
import type { Complex, CustomerAddress } from "@/api/queries";
import { addressBlockDefaults, addressLine, addressWriteBody, billingAddressBody, hasAddressContent, pickOptions } from "@/lib/address-book";

const empty = {
  street: "",
  building_number: "",
  unit_number: "",
  neighborhood_name: null,
  district_name: null,
  province_name: null,
};

const billing = {
  id: "addr-billing",
  label: "Head office",
  province_id: 34,
  province_name: "Istanbul",
  district_id: 449,
  district_name: "Kadikoy",
  neighborhood_id: 9001,
  neighborhood_name: "Cumhuriyet",
  street: "Ataturk Cd.",
  building_number: "12",
  unit_number: "3",
  address_note: "Ring twice",
  latitude: null,
  longitude: null,
  is_billing: true,
} as unknown as CustomerAddress;

const depot = { ...billing, id: "addr-depot", label: "Depot", is_billing: false } as CustomerAddress;
const withPin = { ...billing, id: "addr-pin", latitude: "40.99", longitude: "29.03" } as CustomerAddress;

const site = {
  ...empty,
  id: "site-1",
  province_id: 34,
  province_name: "Istanbul",
  district_id: 449,
  district_name: "Kadikoy",
  neighborhood_id: 9001,
  neighborhood_name: "Cumhuriyet",
  street: "Ataturk Cd.",
  building_number: "12",
  latitude: null,
  longitude: null,
} as unknown as Complex;
const siteWithoutAddress = {
  ...site,
  province_name: null,
  district_name: null,
  neighborhood_name: null,
  street: "",
  building_number: "",
} as Complex;
const siteWithPin = { ...site, latitude: "41.01", longitude: "28.97" } as Complex;

describe("pickOptions", () => {
  it("offers nothing when there is no saved address and no site address", () => {
    expect(pickOptions([], null)).toEqual([]);
    expect(pickOptions([], siteWithoutAddress)).toEqual([]);
  });
  it("lists the site first, then the saved addresses in the order given", () => {
    expect(pickOptions([billing, depot], site).map((o) => o.kind)).toEqual(["site", "saved", "saved"]);
    expect(pickOptions([billing, depot], site)[0].value).toBe("site");
    expect(pickOptions([billing, depot], site)[1].value).toBe(billing.id);
  });
  it("carries ids and names for all three levels", () => {
    const { fill } = pickOptions([billing], null)[0];
    expect(fill).toMatchObject({
      provinceId: 34,
      districtId: 449,
      neighborhoodId: 9001,
      provinceName: "Istanbul",
      districtName: "Kadikoy",
      neighborhoodName: "Cumhuriyet",
    });
  });
  it("copies the pin of a saved address only when both coordinates exist", () => {
    expect(pickOptions([withPin], null)[0].fill.pin).toEqual({ latitude: "40.990000", longitude: "29.030000" });
    expect(pickOptions([{ ...withPin, longitude: null }], null)[0].fill.pin).toBeNull();
  });
  it("never copies the site's pin", () => {
    expect(pickOptions([], siteWithPin)[0].fill.pin).toBeNull();
  });
  it("gives the site no address note and takes its building number", () => {
    expect(pickOptions([], site)[0].fill).toMatchObject({ addressNote: "", buildingNumber: "12" });
  });
});

describe("addressLine", () => {
  it("is null for an address with nothing set", () => {
    expect(addressLine(empty)).toBeNull();
  });
  it("joins what is there and skips what is not", () => {
    expect(addressLine({ ...empty, street: "Ataturk Cd.", building_number: "12" })).toBe("Ataturk Cd. 12");
  });
  it("puts the unit after the number and the area after the street line", () => {
    expect(
      addressLine({
        ...empty,
        street: "Ataturk Cd.",
        building_number: "12",
        unit_number: "3",
        neighborhood_name: "Cumhuriyet",
        district_name: "Kadikoy",
        province_name: "Istanbul",
      }),
    ).toBe("Ataturk Cd. 12 / 3, Cumhuriyet · Kadikoy · Istanbul");
  });
});

describe("hasAddressContent", () => {
  it("is false for an untouched block", () => {
    expect(
      hasAddressContent({ neighborhood: "", street: "  ", building_number: "", unit_number: "" }),
    ).toBe(false);
  });
  it("is true for any one field", () => {
    expect(hasAddressContent({ unit_number: "5" })).toBe(true);
  });
});

describe("billingAddressBody", () => {
  it("is null when the block was left untouched", () => {
    expect(billingAddressBody({}, "Billing")).toBeNull();
    expect(billingAddressBody({ street: "  " }, "Billing")).toBeNull();
  });

  it("builds a billing address from what was typed", () => {
    expect(
      billingAddressBody({ neighborhood: "7", street: "Ataturk Cd.", building_number: "12" }, "Billing"),
    ).toEqual({
      label: "Billing",
      is_billing: true,
      neighborhood: 7,
      street: "Ataturk Cd.",
      building_number: "12",
      unit_number: "",
    });
  });

  it("sends no neighborhood when only the street was typed", () => {
    expect(billingAddressBody({ street: "Ataturk Cd." }, "Billing")?.neighborhood).toBeNull();
  });
});

describe("addressWriteBody", () => {
  const record = {
    ...billing,
    neighborhood_id: 5,
    street: "Ataturk Cd.",
    latitude: "41.0",
    longitude: "29.0",
  } as CustomerAddress;

  it("clears the neighborhood the user emptied", () => {
    expect(addressWriteBody({ label: "A" }, record, false).neighborhood).toBeNull();
  });

  it("keeps a neighborhood that was picked", () => {
    expect(addressWriteBody({ label: "A", neighborhood: "7" }, record, false).neighborhood).toBe("7");
  });

  it("sends an emptied street as an empty string", () => {
    expect(addressWriteBody({ label: "A" }, record, false).street).toBe("");
  });

  it("clears a removed pin", () => {
    const body = addressWriteBody({ label: "A" }, record, false);
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });

  it("keeps a pin that is still there", () => {
    const body = addressWriteBody({ label: "A", latitude: "1", longitude: "2" }, record, true);
    expect(body).toMatchObject({ latitude: "1", longitude: "2", is_billing: true });
  });

  it("sends no null for fields the record never had", () => {
    const body = addressWriteBody({ label: "A" }, { ...record, neighborhood_id: null, latitude: null } as CustomerAddress, false);
    expect("neighborhood" in body).toBe(false);
    expect("latitude" in body).toBe(false);
  });

  it("on create sends no nulls", () => {
    const body = addressWriteBody({ label: "A" }, undefined, false);
    expect("neighborhood" in body).toBe(false);
    expect("latitude" in body).toBe(false);
    expect(body).toMatchObject({ street: "", is_billing: false });
  });
});

describe("addressBlockDefaults", () => {
  const record = {
    province_id: 6,
    province_name: "Ankara",
    district_id: 60,
    district_name: "Cankaya",
    neighborhood_id: 600,
    neighborhood_name: "Kizilay",
    street: "Record St.",
    building_number: "1",
    address_note: "Record note",
    latitude: "39.9",
    longitude: "32.8",
  };
  const [first, , third] = pickOptions([billing, depot, withPin], null);

  it("shows the record's saved values until something is picked", () => {
    const d = addressBlockDefaults(record, null);
    expect(d.initial.neighborhoodId).toBe(600);
    expect(d.street).toBe("Record St.");
    expect(d.addressNote).toBe("Record note");
    expect(d.pin).toEqual({ latitude: "39.900000", longitude: "32.800000" });
  });

  it("is empty on a new form with nothing picked", () => {
    const d = addressBlockDefaults(undefined, null);
    expect(d.initial.neighborhoodId).toBeNull();
    expect(d.street).toBe("");
    expect(d.pin).toBeNull();
  });

  it("replaces every field with the pick, including the note", () => {
    const d = addressBlockDefaults(record, first.fill);
    expect(d.initial).toMatchObject({ provinceId: 34, districtId: 449, neighborhoodId: 9001 });
    expect(d.street).toBe("Ataturk Cd.");
    expect(d.buildingNumber).toBe("12");
    expect(d.addressNote).toBe("Ring twice");
  });

  it("moves the pin when the pick has one", () => {
    expect(addressBlockDefaults(record, third.fill).pin).toEqual(third.fill.pin);
  });

  it("keeps the record's pin when the pick has none", () => {
    expect(first.fill.pin).toBeNull();
    expect(addressBlockDefaults(record, first.fill).pin).toEqual({ latitude: "39.900000", longitude: "32.800000" });
  });
});
