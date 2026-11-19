/**
 * What the saved-address picker offers and what a pick fills in.
 *
 * Pure functions over API reads, so the rules can be tested without a screen.
 */
import type { Complex, CustomerAddress } from "@/api/queries";
import { type Coordinates, coordinateKey, parseCoordinates } from "@/lib/map-provider";

export type FilledAddress = {
  provinceId: number | null;
  provinceName: string | null;
  districtId: number | null;
  districtName: string | null;
  neighborhoodId: number | null;
  neighborhoodName: string | null;
  street: string;
  buildingNumber: string;
  /** null: the entry has no note of its own (the site), so a pick keeps the form's. */
  addressNote: string | null;
  pin: Coordinates | null;
};

/** What a pick may not destroy: the pin and note the form shows at pick time. */
export type CurrentAddressInput = { pin: Coordinates | null; addressNote: string };

/** The pin and note a pick supplied of its own, before the form's values were folded in. */
export type PickWrote = { pin: Coordinates | null; addressNote: string | null };

/** What `fill` supplies of its own, to hand back as `previous` on the next pick. */
export function pickWrote(fill: FilledAddress): PickWrote {
  return { pin: fill.pin, addressNote: fill.addressNote };
}

/**
 * The fill a pick actually writes, given what the form holds now.
 *
 * An entry without a pin keeps the pin on screen (it never removes one), and an
 * entry without a note of its own keeps the note on screen. A saved address
 * replaces the note with its own, empty or not.
 *
 * "On screen" means set by the user, not written by the pick before this one:
 * when the form still holds exactly what `previous` wrote, that is treated as
 * nothing, so picking again replaces it instead of letting it leak into an
 * address that has no pin or note of its own.
 */
export function resolvePick(
  fill: FilledAddress,
  current: CurrentAddressInput,
  previous: PickWrote | null = null,
): FilledAddress {
  const ownPin =
    previous?.pin && coordinateKey(previous.pin) === coordinateKey(current.pin) ? null : current.pin;
  const ownNote =
    previous?.addressNote != null && previous.addressNote === current.addressNote
      ? ""
      : current.addressNote;
  return {
    ...fill,
    pin: fill.pin ?? ownPin,
    addressNote: fill.addressNote ?? ownNote,
  };
}

export type PickOption = {
  value: string;
  kind: "site" | "saved";
  label: string;
  fill: FilledAddress;
};

/** The fields `addressLine` reads: a saved address, a site and a building all fit. */
export type AddressParts = {
  street: string;
  building_number: string;
  unit_number?: string;
  neighborhood_name: string | null;
  district_name: string | null;
  province_name: string | null;
};

/** "Ataturk Cd. 12 / 3, Cumhuriyet Mah. · Kadikoy · Istanbul"; null when nothing is set. */
export function addressLine(a: AddressParts): string | null {
  const line = [a.street, a.building_number, a.unit_number && `/ ${a.unit_number}`]
    .filter(Boolean)
    .join(" ");
  const area = [a.neighborhood_name, a.district_name, a.province_name].filter(Boolean).join(" · ");
  const address = [line, area].filter(Boolean).join(", ");
  return address || null;
}

/**
 * Site first (kind "site", value "site"), then saved addresses in the order given.
 *
 * The site goes first because blocks of one site share its address and it is
 * usually not in the customer's saved list. Its pin is never copied: a building
 * without a pin already falls back to its site's position, so leaving it empty
 * keeps following later corrections to the site.
 */
export function pickOptions(addresses: CustomerAddress[], site: Complex | null): PickOption[] {
  const options: PickOption[] = [];

  const siteLabel = site ? addressLine(site) : null;
  if (site && siteLabel) {
    options.push({
      value: "site",
      kind: "site",
      label: siteLabel,
      fill: {
        provinceId: site.province_id,
        provinceName: site.province_name,
        districtId: site.district_id,
        districtName: site.district_name,
        neighborhoodId: site.neighborhood_id,
        neighborhoodName: site.neighborhood_name,
        street: site.street,
        buildingNumber: site.building_number,
        addressNote: null,
        pin: null,
      },
    });
  }

  for (const a of addresses) {
    options.push({
      value: a.id,
      kind: "saved",
      label: a.label,
      fill: {
        provinceId: a.province_id,
        provinceName: a.province_name,
        districtId: a.district_id,
        districtName: a.district_name,
        neighborhoodId: a.neighborhood_id,
        neighborhoodName: a.neighborhood_name,
        street: a.street,
        buildingNumber: a.building_number,
        addressNote: a.address_note,
        pin: parseCoordinates(a.latitude, a.longitude),
      },
    });
  }

  return options;
}

/** The saved fields of a site or building, as far as the address block reads them. */
export type AddressRecord = {
  province_id: number | null;
  province_name: string | null;
  district_id: number | null;
  district_name: string | null;
  neighborhood_id: number | null;
  neighborhood_name: string | null;
  street: string;
  building_number: string;
  address_note?: string;
  latitude?: string | null;
  longitude?: string | null;
};

/**
 * What the address block opens with: the resolved pick (see `resolvePick`) when
 * there is one, otherwise the record being edited (or nothing on a new form).
 */
export function addressBlockDefaults(record: AddressRecord | undefined, pick: FilledAddress | null) {
  if (pick) {
    return {
      initial: {
        provinceId: pick.provinceId,
        provinceName: pick.provinceName,
        districtId: pick.districtId,
        districtName: pick.districtName,
        neighborhoodId: pick.neighborhoodId,
        neighborhoodName: pick.neighborhoodName,
      },
      street: pick.street,
      buildingNumber: pick.buildingNumber,
      addressNote: pick.addressNote ?? "",
      pin: pick.pin,
    };
  }
  return {
    initial: {
      provinceId: record?.province_id ?? null,
      provinceName: record?.province_name ?? null,
      districtId: record?.district_id ?? null,
      districtName: record?.district_name ?? null,
      neighborhoodId: record?.neighborhood_id ?? null,
      neighborhoodName: record?.neighborhood_name ?? null,
    },
    street: record?.street ?? "",
    buildingNumber: record?.building_number ?? "",
    addressNote: record?.address_note ?? "",
    pin: parseCoordinates(record?.latitude, record?.longitude),
  };
}

/** True when the create form's block holds anything worth a second request. */
export function hasAddressContent(v: {
  neighborhood?: string;
  street?: string;
  building_number?: string;
  unit_number?: string;
}): boolean {
  return [v.neighborhood, v.street, v.building_number, v.unit_number].some(
    (field) => (field ?? "").trim() !== "",
  );
}

/**
 * The request body that saves the create form's block as the customer's
 * billing address, or null when the block holds nothing and no request is due.
 */
export function billingAddressBody(
  v: {
    neighborhood?: string;
    street?: string;
    building_number?: string;
    unit_number?: string;
  },
  label: string,
) {
  if (!hasAddressContent(v)) return null;
  return {
    label,
    is_billing: true,
    neighborhood: v.neighborhood ? Number(v.neighborhood) : null,
    street: v.street ?? "",
    building_number: v.building_number ?? "",
    unit_number: v.unit_number ?? "",
  };
}

const ADDRESS_BLOCK_KEYS = ["neighborhood", "street", "building_number", "unit_number"];

/**
 * The customer's own write: the form's values without the create form's
 * address block, which is saved as a separate request and which the customer
 * endpoint rejects as unknown fields.
 */
export function customerWriteBody(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !ADDRESS_BLOCK_KEYS.includes(key)));
}

/**
 * The request body for the address form.
 *
 * `formValues` drops an empty string, which is right for a field left blank on
 * create and wrong for one deliberately cleared on edit: a PATCH without the
 * key leaves the old value. So on edit every clearable field the record holds
 * is sent explicitly. The neighbourhood needs it as much as the rest, because
 * changing the province or district empties it.
 */
export function addressWriteBody(
  values: Record<string, unknown>,
  record: CustomerAddress | undefined,
  isBilling: boolean,
): Record<string, unknown> {
  const body = record ? editWriteBody(values, record, []) : { ...values };
  for (const key of ["street", "building_number", "unit_number", "address_note"]) {
    body[key] = (values[key] as string | undefined) ?? "";
  }
  body.is_billing = isBilling;
  return body;
}

/**
 * The PATCH body for an edit, where an absent key means "leave it alone".
 *
 * `formValues` drops what the form holds empty, so on edit the record's
 * clearable fields are sent explicitly: the neighbourhood and the pin as null
 * when the record had one and the form no longer does, and each of `blankKeys`
 * as an empty string.
 */
export function editWriteBody(
  values: Record<string, unknown>,
  record: { neighborhood_id: number | null; district_id?: number | null; latitude?: string | null },
  blankKeys: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...values };
  // Only when the form could have shown the neighbourhood: its select is
  // disabled (and not submitted) until a district is known, so without one an
  // absent value says nothing about what the user wanted.
  if (record.neighborhood_id != null && record.district_id != null && body.neighborhood === undefined) {
    body.neighborhood = null;
  }
  if (record.latitude != null && body.latitude === undefined) {
    body.latitude = null;
    body.longitude = null;
  }
  for (const key of blankKeys) {
    body[key] = (values[key] as string | undefined) ?? "";
  }
  return body;
}

/** The pin and note a form holds right now, read from its fields at pick time. */
export function currentAddressInput(form: HTMLFormElement | null): CurrentAddressInput {
  if (!form) return { pin: null, addressNote: "" };
  const data = new FormData(form);
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value : null;
  };
  return {
    pin: parseCoordinates(text("latitude"), text("longitude")),
    addressNote: text("address_note") ?? "",
  };
}
