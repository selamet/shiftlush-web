import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { districtQuery, neighborhoodQuery, provinceQuery } from "@/api/queries";
import { errorMessage } from "@/api/errors";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { LocationPicker } from "@/components/forms/LocationPicker";
import {
  ADDRESS_LEVELS,
  hasAnyMatch,
  reverseGeocodeQuery,
  type AddressLevel,
  type Coordinates,
  type ReverseGeocodeResult,
} from "@/lib/map-provider";

const MIN_SEARCH_LENGTH = 2;

/** Kept out of the `t()` call so the key checker still sees literals. */
const LEVEL_LABEL: Record<AddressLevel, string> = {
  province: "address.province",
  district: "address.district",
  neighborhood: "address.neighborhood",
};

/**
 * Province, then district, then neighbourhood — and, where the record can store
 * one, a pin.
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
 *
 * ## What the map is allowed to do
 *
 * Dropping a pin asks `GET /geocode/reverse` and *offers* what comes back. It
 * does not fill anything in. Spec 9.4 is blunt about why — "auto-filling the
 * wrong neighbourhood is worse than leaving it blank" — and the failure it
 * describes is not hypothetical: a wrong address is saved, printed onto a QR
 * label and dispatched to, and nobody re-reads a field that filled itself in.
 *
 * So the answer arrives as a panel naming what was found and what was not, the
 * cascade is untouched until someone presses accept, and a level the endpoint
 * reports in `unmatched` is never filled by accepting — it is stated as not
 * found and left for the user to pick. What an accept does write stays editable
 * and says on its face that it came from the map.
 */
export function AddressSelect({
  name,
  initial,
  error,
  required = true,
  location,
}: {
  name: string;
  /**
   * The record being edited, so the chain can open where it left off.
   *
   * The names are nullable because the neighbourhood is: a record can be
   * entered before anyone knows where it is, and the API says so now.
   */
  initial?: {
    neighborhoodId: number | null;
    districtName: string | null;
    provinceName: string | null;
  };
  error?: string;
  /**
   * A building has to be somewhere. A customer does not: the address here is
   * where the invoice goes, and it is often not known at the first call.
   */
  required?: boolean;
  /**
   * Passed only by the screens whose write contract has `latitude` and
   * `longitude` — buildings and complexes. Its absence is what keeps the map
   * off the customer form and the settings screen, where a pin someone placed
   * would be dropped on save with nothing said about it.
   */
  location?: { initial: Coordinates | null };
}) {
  const { t } = useTranslation();

  const provinces = useQuery(provinceQuery());
  const [provinceId, setProvinceId] = useState<number | null>(null);
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [neighborhoodId, setNeighborhoodId] = useState<number | null>(
    initial?.neighborhoodId ?? null,
  );
  const [search, setSearch] = useState("");

  /**
   * Display labels for values the loaded options cannot name.
   *
   * The district list arrives a province at a time and the neighbourhood list
   * only ever holds one search's worth, so a value set from a suggestion — or
   * read off the record being edited — has no option behind it to take a label
   * from. Without these the picker renders a chosen value as an empty box.
   */
  const [districtLabel, setDistrictLabel] = useState("");
  const [neighborhoodLabel, setNeighborhoodLabel] = useState(() =>
    [initial?.provinceName, initial?.districtName].filter(Boolean).join(" · "),
  );

  /** Levels currently holding a value that came from the map, not from a pick. */
  const [fromMap, setFromMap] = useState<ReadonlySet<AddressLevel>>(() => new Set());

  const districts = useQuery(districtQuery(provinceId));
  const neighborhoods = useQuery(neighborhoodQuery(districtId, search));

  const [pin, setPin] = useState<Coordinates | null>(location?.initial ?? null);

  /**
   * The pin we are asking about — never the one the record arrived with.
   *
   * Re-opening a saved location to ask "are you sure this is Kadikoy?" would be
   * this component second-guessing an address somebody already settled, and it
   * would spend a geocode call on every edit of every building to do it. Only a
   * pin placed in this session is a question.
   */
  const [asked, setAsked] = useState<Coordinates | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const geocode = useQuery(reverseGeocodeQuery(asked));
  const pending = asked !== null && !dismissed;
  const suggestion = pending ? (geocode.data ?? null) : null;

  const provinceName = provinces.data?.find((province) => province.id === provinceId)?.name ?? "";

  function withoutLevels(...levels: AddressLevel[]): ReadonlySet<AddressLevel> {
    const next = new Set(fromMap);
    for (const level of levels) next.delete(level);
    return next;
  }

  function chooseProvince(value: string) {
    setProvinceId(Number(value) || null);
    // Changing the province invalidates everything below it. Leaving a district
    // from the previous province selected is how a building ends up filed in
    // the wrong place with every field looking filled in — and the same goes for
    // the neighbourhood, which is the id this component actually reports.
    setDistrictId(null);
    setDistrictLabel("");
    setNeighborhoodId(null);
    setNeighborhoodLabel("");
    setSearch("");
    setFromMap(new Set());
  }

  function chooseDistrict(value: string) {
    setDistrictId(Number(value) || null);
    setDistrictLabel("");
    setNeighborhoodId(null);
    setNeighborhoodLabel("");
    setSearch("");
    setFromMap(withoutLevels("district", "neighborhood"));
  }

  function chooseNeighborhood(value: string) {
    const id = Number(value) || null;
    setNeighborhoodId(id);
    // Captured now, while the search that produced it is still the loaded list:
    // the picker clears its query as it closes, which empties the options.
    setNeighborhoodLabel(neighborhoods.data?.find((item) => item.id === id)?.name ?? "");
    setFromMap(withoutLevels("neighborhood"));
  }

  function handlePin(next: Coordinates | null) {
    setPin(next);
    // Clearing the pin withdraws the question along with it.
    setAsked(next);
    setDismissed(false);
  }

  /**
   * Writes only what the endpoint actually resolved.
   *
   * A level it could not resolve is neither filled in from the level above it
   * nor left holding whatever was there before: province and district agreeing
   * on a new place makes a neighbourhood chosen for the old one wrong, and a
   * wrong one left in place is the exact failure spec 9.4 names.
   */
  function acceptSuggestion(result: ReverseGeocodeResult) {
    const applied = new Set<AddressLevel>();

    if (result.province) {
      setProvinceId(result.province.id);
      applied.add("province");
    }

    if (result.district) {
      setDistrictId(result.district.id);
      setDistrictLabel(result.district.name);
      applied.add("district");
    } else if (result.province) {
      setDistrictId(null);
      setDistrictLabel("");
    }

    if (result.neighborhood) {
      setNeighborhoodId(result.neighborhood.id);
      setNeighborhoodLabel(result.neighborhood.name);
      applied.add("neighborhood");
    } else if (result.province || result.district) {
      setNeighborhoodId(null);
      setNeighborhoodLabel("");
    }

    setSearch("");
    setFromMap(applied);
    setDismissed(true);
  }

  /** The "came from the map, still yours to change" note under a filled field. */
  function mapHint(level: AddressLevel, value: string): string | undefined {
    if (!fromMap.has(level) || !value) return undefined;
    return t("addressPicker.writtenNotLocked", { name: value });
  }

  return (
    <div className="flex flex-col gap-4">
      {location && <LocationPicker value={pin} onChange={handlePin} />}

      {pending && geocode.isFetching && (
        <p className="text-help text-muted-foreground">{t("common.loading")}</p>
      )}

      {suggestion &&
        (hasAnyMatch(suggestion) ? (
          <Alert tone="info" block title={t("addressPicker.suggestionTitle")}>
            <p className="text-help">{t("address.hints.geocodeSuggestion")}</p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {ADDRESS_LEVELS.map((level) => {
                const match = suggestion[level];
                return (
                  <li key={level} className="text-help">
                    <span className="text-muted-foreground">{t(LEVEL_LABEL[level])}: </span>
                    {match ? (
                      <>
                        <span className="font-medium">{match.name}</span>
                        <span className="text-muted-foreground">
                          {" · "}
                          {t("address.hints.matchConfidence", {
                            percent: Math.round(match.confidence * 100),
                          })}
                        </span>
                      </>
                    ) : (
                      // Stated, not omitted. The endpoint names these in
                      // `unmatched` so a client can tell "we looked and found
                      // nothing" from "not filled in yet", and only one of the
                      // two is worth putting in front of the user.
                      <span className="text-muted-foreground">
                        {t("address.hints.levelUnmatched")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => acceptSuggestion(suggestion)}>
                {t("addressPicker.confirmSuggestion")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                {t("addressPicker.fix")}
              </Button>
            </div>
          </Alert>
        ) : (
          // Three nulls and a full `unmatched` list: the lookup worked and
          // matched nothing. There is no accept button because there is nothing
          // to accept, and the pin is kept — where the building stands and what
          // the neighbourhood is called are two different facts.
          <Alert tone="warning" block title={t("addressPicker.notFoundTitle")}>
            <p className="text-help">{t("addressPicker.flowNotBlocked")}</p>
            <Button className="mt-2" size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              {t("common.close")}
            </Button>
          </Alert>
        ))}

      {pending && geocode.isError && (
        <Alert tone="warning" block title={errorMessage(geocode.error, t)}>
          <p className="text-help">{t("addressPicker.flowNotBlocked")}</p>
          <Button className="mt-2" size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            {t("common.close")}
          </Button>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t("address.province")}
          htmlFor="addr-province"
          hint={mapHint("province", provinceName)}
        >
          <SearchableSelect
            id="addr-province"
            value={provinceId === null ? "" : String(provinceId)}
            onChange={chooseProvince}
            disabled={provinces.isPending}
            placeholder={t("address.selectProvince")}
            options={(provinces.data ?? []).map((province) => ({
              value: String(province.id),
              label: province.name,
            }))}
          />
        </Field>

        <Field
          label={t("address.district")}
          htmlFor="addr-district"
          hint={mapHint("district", districtLabel)}
        >
          <SearchableSelect
            id="addr-district"
            value={districtId === null ? "" : String(districtId)}
            onChange={chooseDistrict}
            // Not merely empty — unusable. The server would return nothing, and
            // an enabled control that yields nothing reads as a fault.
            disabled={provinceId === null || districts.isPending}
            // A district accepted from the map is set before its list has
            // arrived, so the options cannot name it yet.
            selectedLabel={districtLabel}
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

      <Field
        label={t("address.neighborhood")}
        htmlFor="addr-neighborhood"
        required={required}
        hint={mapHint("neighborhood", neighborhoodLabel)}
        error={error}
      >
        <SearchableSelect
          id="addr-neighborhood"
          name={name}
          required={required}
          value={neighborhoodId === null ? "" : String(neighborhoodId)}
          onChange={chooseNeighborhood}
          // The record carries the names, so there is no request to make just
          // to render a value that is already known.
          selectedLabel={neighborhoodLabel}
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
