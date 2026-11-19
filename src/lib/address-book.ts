/**
 * What the saved-address picker offers and what a pick fills in.
 *
 * Pure functions over API reads, so the rules can be tested without a screen.
 */
import type { Complex, CustomerAddress } from "@/api/queries";
import { type Coordinates, parseCoordinates } from "@/lib/map-provider";

export type FilledAddress = {
  provinceId: number | null;
  provinceName: string | null;
  districtId: number | null;
  districtName: string | null;
  neighborhoodId: number | null;
  neighborhoodName: string | null;
  street: string;
  buildingNumber: string;
  addressNote: string;
  pin: Coordinates | null;
};

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
        addressNote: "",
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
  const body: Record<string, unknown> = { ...values };
  if (record && record.neighborhood_id != null && body.neighborhood === undefined) {
    body.neighborhood = null;
  }
  if (record && record.latitude != null && body.latitude === undefined) {
    body.latitude = null;
    body.longitude = null;
  }
  for (const key of ["street", "building_number", "unit_number", "address_note"]) {
    body[key] = (values[key] as string | undefined) ?? "";
  }
  body.is_billing = isBilling;
  return body;
}
