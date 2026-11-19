/**
 * The saved-address picker's rules: what it offers and what a pick fills in.
 */
import { describe, expect, it } from "vitest";
import type { Complex, CustomerAddress } from "@/api/queries";
import { customerWriteBody, addressBlockDefaults, addressLine, addressWriteBody, editWriteBody, resolvePick, billingAddressBody, hasAddressContent, pickOptions } from "@/lib/address-book";

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
  it("gives the site no address note of its own (null, not empty) and takes its building number", () => {
    expect(pickOptions([], site)[0].fill).toMatchObject({ addressNote: null, buildingNumber: "12" });
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

describe("customerWriteBody", () => {
  it("drops the address block's four keys and passes everything else through", () => {
    const values = {
      legal_name: "Acme",
      phone: "1",
      neighborhood: "7",
      street: "S",
      building_number: "1",
      unit_number: "2",
    };
    expect(customerWriteBody(values)).toEqual({ legal_name: "Acme", phone: "1" });
  });
  it("does not mutate its input", () => {
    const values = { street: "S", legal_name: "A" };
    customerWriteBody(values);
    expect(values).toEqual({ street: "S", legal_name: "A" });
  });
});

describe("resolvePick, what the previous pick wrote", () => {
  const A = pickOptions([withPin], null)[0].fill;
  const B = pickOptions([{ ...billing, id: "b2", latitude: null, longitude: null }], null)[0].fill;
  const siteFill = pickOptions([], site)[0].fill;
  const wrote = (f: typeof A) => ({ pin: f.pin, addressNote: f.addressNote });
  const note = (text: string) => ({ pin: null, addressNote: text });

  it("A with a pin, then B without, leaves no pin", () => {
    expect(resolvePick(B, { pin: A.pin, addressNote: "" }, wrote(A)).pin).toBeNull();
    expect(resolvePick(siteFill, { pin: A.pin, addressNote: "" }, wrote(A)).pin).toBeNull();
  });
  it("a pin dropped by hand, then B without, keeps it", () => {
    const hand = { latitude: "5.000000", longitude: "6.000000" };
    expect(resolvePick(B, { pin: hand, addressNote: "" }, wrote(A)).pin).toEqual(hand);
    expect(resolvePick(B, { pin: hand, addressNote: "" }, null).pin).toEqual(hand);
  });
  it("A with a pin, the user moves it, then B without, keeps the moved pin", () => {
    const moved = { latitude: "41.000000", longitude: "29.000000" };
    expect(resolvePick(B, { pin: moved, addressNote: "" }, wrote(A)).pin).toEqual(moved);
  });
  it("a note the previous pick wrote does not survive a site pick", () => {
    expect(resolvePick(siteFill, { pin: null, addressNote: "Ring twice" }, wrote(A)).addressNote).toBe("");
  });
  it("a note typed by hand survives a site pick", () => {
    expect(resolvePick(siteFill, { pin: null, addressNote: "mine" }, wrote(A)).addressNote).toBe("mine");
    expect(resolvePick(siteFill, { pin: null, addressNote: "mine" }, null).addressNote).toBe("mine");
  });
  it("a note changed after the pick survives a site pick", () => {
    expect(resolvePick(siteFill, { pin: null, addressNote: "Ring twice, then call" }, wrote(A)).addressNote).toBe(
      "Ring twice, then call",
    );
  });
  it("a note the previous site pick kept is the user's own", () => {
    expect(resolvePick(siteFill, { pin: null, addressNote: "mine" }, note("x")).addressNote).toBe("mine");
  });
});

describe("resolvePick", () => {
  const [siteOption, savedOption, pinOption] = pickOptions([billing, withPin], site).slice(0, 3);
  const current = { pin: { latitude: "1.000000", longitude: "2.000000" }, addressNote: "typed note" };

  it("keeps the pin the form shows when the pick has none", () => {
    expect(resolvePick(savedOption.fill, current).pin).toEqual(current.pin);
    expect(resolvePick(siteOption.fill, current).pin).toEqual(current.pin);
  });
  it("keeps 'no pin' when the form shows none", () => {
    expect(resolvePick(savedOption.fill, { ...current, pin: null }).pin).toBeNull();
  });
  it("moves the pin when the pick has one", () => {
    expect(resolvePick(pinOption.fill, current).pin).toEqual(pinOption.fill.pin);
  });
  it("keeps the current note on a site pick", () => {
    expect(resolvePick(siteOption.fill, current).addressNote).toBe("typed note");
  });
  it("replaces the note with a saved address's own, even when empty", () => {
    expect(resolvePick(savedOption.fill, current).addressNote).toBe("Ring twice");
    const noNote = pickOptions([{ ...billing, address_note: "" }], null)[0].fill;
    expect(resolvePick(noNote, current).addressNote).toBe("");
  });
  it("replaces the address fields", () => {
    expect(resolvePick(savedOption.fill, current)).toMatchObject({ street: "Ataturk Cd.", neighborhoodId: 9001 });
  });
});

describe("editWriteBody", () => {
  const record = { neighborhood_id: 5, district_id: 3, latitude: "41.0" };
  it("sends an emptied optional text field as an empty string", () => {
    const body = editWriteBody({ name: "x" }, record, ["street", "address_note"]);
    expect(body.street).toBe("");
    expect(body.address_note).toBe("");
  });
  it("keeps a value that is there", () => {
    expect(editWriteBody({ street: "S" }, record, ["street"]).street).toBe("S");
  });
  it("nulls a neighborhood and a pin the form no longer holds", () => {
    const body = editWriteBody({}, record, []);
    expect(body.neighborhood).toBeNull();
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });
  it("leaves them out when the record never had them", () => {
    const body = editWriteBody({}, { neighborhood_id: null, district_id: null, latitude: null }, []);
    expect("neighborhood" in body).toBe(false);
    expect("latitude" in body).toBe(false);
  });
  it("sends no neighborhood null when the record has no district, as the form could not have shown it", () => {
    for (const district_id of [null, undefined]) {
      const body = editWriteBody({}, { neighborhood_id: 5, district_id, latitude: null }, []);
      expect("neighborhood" in body).toBe(false);
    }
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
  const current = { pin: null, addressNote: "" };
  const resolved = (i: number) => resolvePick(pickOptions([billing, depot, withPin], null)[i].fill, current);

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
  it("shows the resolved pick over the record, pin included", () => {
    const d = addressBlockDefaults(record, resolved(0));
    expect(d.initial).toMatchObject({ provinceId: 34, districtId: 449, neighborhoodId: 9001 });
    expect(d.street).toBe("Ataturk Cd.");
    expect(d.addressNote).toBe("Ring twice");
    expect(d.pin).toBeNull();
  });
  it("shows a picked pin", () => {
    expect(addressBlockDefaults(record, resolved(2)).pin).toEqual({ latitude: "40.990000", longitude: "29.030000" });
  });
});
