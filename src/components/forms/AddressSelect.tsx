import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { districtQuery, neighborhoodQuery, provinceQuery } from "@/api/queries";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const MIN_SEARCH_LENGTH = 2;

const selectClass =
  "h-control-md w-full rounded-md border border-input bg-card px-3 text-body focus-ring pointer-coarse:h-control-lg disabled:cursor-not-allowed disabled:opacity-60";

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
  const [chosen, setChosen] = useState<{ id: number; label: string } | null>(
    initial?.neighborhoodId
      ? {
          id: initial.neighborhoodId,
          // Shown until the user starts again. The record carries the names, so
          // there is no request to make just to render what is already known.
          label: [initial.provinceName, initial.districtName].filter(Boolean).join(" · "),
        }
      : null,
  );

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
      <input type="hidden" name={name} value={chosen?.id ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("address.province")} htmlFor="addr-province" bindChild={false}>
          <select
            id="addr-province"
            className={selectClass}
            value={provinceId ?? ""}
            disabled={provinces.isPending}
            onChange={(event) => setProvinceId(Number(event.target.value) || null)}
          >
            <option value="">{t("address.selectProvince")}</option>
            {(provinces.data ?? []).map((province) => (
              <option key={province.id} value={province.id}>
                {province.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t("address.district")} htmlFor="addr-district" bindChild={false}>
          <select
            id="addr-district"
            className={selectClass}
            value={districtId ?? ""}
            // Not merely empty — unusable. The server would return nothing, and
            // an enabled control that yields nothing reads as a fault.
            disabled={provinceId === null || districts.isPending}
            onChange={(event) => {
              setDistrictId(Number(event.target.value) || null);
              setSearch("");
            }}
          >
            <option value="">
              {provinceId === null ? t("address.selectProvinceFirst") : t("address.selectDistrict")}
            </option>
            {(districts.data ?? []).map((district) => (
              <option key={district.id} value={district.id}>
                {district.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label={t("address.neighborhood")}
        htmlFor="addr-neighborhood"
        required
        hint={chosen ? undefined : t("address.neighborhoodHint", { count: MIN_SEARCH_LENGTH })}
        error={error}
        bindChild={false}
      >
        {chosen ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-input bg-muted px-3 py-2">
            <span className="text-body">{chosen.label}</span>
            <button
              type="button"
              className="text-help text-primary hover:underline"
              onClick={() => {
                setChosen(null);
                setSearch("");
              }}
            >
              {t("common.change")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3 size-4 text-subtle"
                aria-hidden="true"
              />
              <Input
                id="addr-neighborhood"
                type="search"
                autoComplete="off"
                className="pl-9"
                placeholder={t("address.neighborhoodPlaceholder")}
                disabled={districtId === null}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            {districtId !== null && search.trim().length >= MIN_SEARCH_LENGTH && (
              <div
                className={cn(
                  "max-h-56 overflow-y-auto rounded-md border border-border-subtle bg-card",
                  neighborhoods.isPending && "opacity-60",
                )}
              >
                {(neighborhoods.data ?? []).length === 0 ? (
                  <p className="px-3 py-2 text-help text-muted-foreground">
                    {neighborhoods.isPending ? t("common.loading") : t("address.noMatch")}
                  </p>
                ) : (
                  (neighborhoods.data ?? []).map((neighborhood) => (
                    <button
                      key={neighborhood.id}
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted"
                      onClick={() =>
                        setChosen({
                          id: neighborhood.id,
                          label: `${neighborhood.name} · ${neighborhood.district_name} · ${neighborhood.province_name}`,
                        })
                      }
                    >
                      <span className="text-body">{neighborhood.name}</span>
                      <span className="text-help text-muted-foreground">
                        {neighborhood.district_name} · {neighborhood.province_name}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Field>
    </div>
  );
}
