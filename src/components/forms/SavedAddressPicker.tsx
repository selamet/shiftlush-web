import { useTranslation } from "react-i18next";
import { addressLine, type FilledAddress, type PickOption } from "@/lib/address-book";
import { Field } from "@/components/ui/field";
import { SearchableSelect } from "@/components/ui/searchable-select";

/**
 * Copies one of the customer's saved addresses (or the site's) into the
 * address fields below it.
 *
 * Nothing is selected on mount and nothing is written until a row is chosen.
 * It has no `name`, so it is not part of the submitted form: what is saved is
 * whatever the fields hold afterwards.
 */
export function SavedAddressPicker({
  options,
  onPick,
}: {
  options: PickOption[];
  onPick: (fill: FilledAddress) => void;
}) {
  const { t } = useTranslation();
  if (options.length === 0) return null;

  return (
    <Field
      label={t("addressPicker.label")}
      htmlFor="saved-address-picker"
      hint={t("addressPicker.hint")}
      bindChild={false}
    >
      <SearchableSelect
        id="saved-address-picker"
        placeholder={t("addressPicker.placeholder")}
        onChange={(value) => {
          const picked = options.find((option) => option.value === value);
          if (picked) onPick(picked.fill);
        }}
        options={options.map((option) => {
          const label = option.kind === "site" ? t("addressPicker.site") : option.label;
          const line = addressLine({
            street: option.fill.street,
            building_number: option.fill.buildingNumber,
            neighborhood_name: option.fill.neighborhoodName,
            district_name: option.fill.districtName,
            province_name: option.fill.provinceName,
          });
          return { value: option.value, label: line ? `${label} — ${line}` : label };
        })}
      />
    </Field>
  );
}
