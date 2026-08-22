import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { districtQuery, neighborhoodQuery, provinceQuery } from "@/api/queries";
import { Field } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";

const MIN_SEARCH_LENGTH = 2;

/**
 * Province, then district, then neighbourhood.
 *
 * The chain is the server's, not a convenience: districts refuse to answer
 * without a province, and neighbourhoods without a district and two characters
 * of search. There are around fifty thousand neighbourhoods and the full list
 * is never served, so there is no shortcut available to the client and no
 * reason to pretend otherwise in the interface — each control is disabled until
 * the one above it has an answer.
 *
 * All three are the same picker. Only the neighbourhood searches remotely,
 * which is one prop rather than the separate hand-written input, result list
 * and chosen-state chip this component used to carry.
 *
 * Reports only the neighbourhood id, because that is the only part of the chain
 * a building record stores; province and district hang off it.
 */
export function AddressSelect({
  name,
  initial,
  error,
}: {
  name: string;
  /** The record being edited, so the chain can open where it left off. */
  initial?: { neighborhoodId: number | null; districtName: string; provinceName: string };
  error?: string;
}) {
  const { t } = useTranslation();

  const provinces = useQuery(provinceQuery());
  const [provinceId, setProvinceId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const districts = useQuery(districtQuery(provinceId));
  const neighborhoods = useQuery(neighborhoodQuery(districtId, search));

  useEffect(() => {
    // Changing the province invalidates everything below it. Leaving a district
    // from the previous province selected is how a building ends up filed in
    // the wrong place with every field looking filled in.
    setDistrictId(null);
    setSearch("");
  }, [provinceId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("address.province")} htmlFor="addr-province">
          <SearchableSelect
            id="addr-province"
            value={provinceId === null ? "" : String(provinceId)}
            onChange={(value) => setProvinceId(Number(value) || null)}
            disabled={provinces.isPending}
            placeholder={t("address.selectProvince")}
            options={(provinces.data ?? []).map((province) => ({
              value: String(province.id),
              label: province.name,
            }))}
          />
        </Field>

        <Field label={t("address.district")} htmlFor="addr-district">
          <SearchableSelect
            id="addr-district"
            value={districtId === null ? "" : String(districtId)}
            onChange={(value) => {
              setDistrictId(Number(value) || null);
              setSearch("");
            }}
            // Not merely empty — unusable. The server would return nothing, and
            // an enabled control that yields nothing reads as a fault.
            disabled={provinceId === null || districts.isPending}
            placeholder={
              provinceId === null ? t("address.selectProvinceFirst") : t("address.selectDistrict")
            }
            options={(districts.data ?? []).map((district) => ({
              value: String(district.id),
              label: district.name,
            }))}
          />
        </Field>
      </div>

      <Field label={t("address.neighborhood")} htmlFor="addr-neighborhood" required error={error}>
        <SearchableSelect
          id="addr-neighborhood"
          name={name}
          required
          defaultValue={initial?.neighborhoodId ? String(initial.neighborhoodId) : ""}
          // The record carries the names, so there is no request to make just
          // to render a value that is already known.
          selectedLabel={[initial?.provinceName, initial?.districtName]
            .filter(Boolean)
            .join(" · ")}
          disabled={districtId === null}
          invalid={Boolean(error)}
          placeholder={t("address.neighborhoodPlaceholder")}
          onSearchChange={setSearch}
          loading={neighborhoods.isFetching}
          minSearchLength={MIN_SEARCH_LENGTH}
          emptyLabel={t("address.noMatch")}
          options={(neighborhoods.data ?? []).map((neighborhood) => ({
            value: String(neighborhood.id),
            label: neighborhood.name,
            hint: `${neighborhood.district_name} · ${neighborhood.province_name}`,
          }))}
        />
      </Field>
    </div>
  );
}
