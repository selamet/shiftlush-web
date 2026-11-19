/** What `AddressSelect` can be started from. Ids are optional so name-only callers keep working. */
export interface AddressSelectInitial {
  provinceId?: number | null;
  provinceName: string | null;
  districtId?: number | null;
  districtName: string | null;
  neighborhoodId: number | null;
  neighborhoodName?: string | null;
}

export interface AddressSelectState {
  provinceId: number | null;
  districtId: number | null;
  neighborhoodId: number | null;
  /** Label for a district whose option list has not loaded (it is fetched per province). */
  districtLabel: string;
  /** Label for a neighbourhood that no loaded search result can name. */
  neighborhoodLabel: string;
}

/**
 * The state `AddressSelect` opens with.
 *
 * With ids, every level is set and each label comes from the record's own name.
 * With only names, the province and district stay empty and the neighbourhood
 * carries a "Province · District" label, as before.
 */
export function initialAddressState(initial: AddressSelectInitial | undefined): AddressSelectState {
  const districtId = initial?.districtId ?? null;
  const neighborhoodId = initial?.neighborhoodId ?? null;

  const districtLabel = districtId === null ? "" : (initial?.districtName ?? "");
  const fallbackLabel =
    neighborhoodId === null
      ? ""
      : [initial?.provinceName, initial?.districtName].filter(Boolean).join(" · ");

  return {
    provinceId: initial?.provinceId ?? null,
    districtId,
    neighborhoodId,
    districtLabel,
    neighborhoodLabel:
      neighborhoodId === null ? "" : (initial?.neighborhoodName ?? fallbackLabel),
  };
}
