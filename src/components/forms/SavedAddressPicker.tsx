import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
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
 *
 * It is always on screen, never silently absent: hidden, a firm whose customer
 * had no saved address saw no picker at all and read it as the feature being
 * missing. With nothing to offer it is disabled and says why — no customer
 * chosen yet, or a customer with no saved address, with a way to add one.
 */
export function SavedAddressPicker({
  customerId,
  loading,
  options,
  onPick,
}: {
  /** The selected customer, or "" before one is chosen. */
  customerId: string;
  /** The customer's addresses are still on their way. */
  loading: boolean;
  options: PickOption[];
  onPick: (fill: FilledAddress) => void;
}) {
  const { t } = useTranslation();
  const empty = options.length === 0;
  const noCustomer = customerId === "";
  const noAddress = !noCustomer && !loading && empty;

  const hint = noCustomer
    ? t("addressPicker.chooseCustomerFirst")
    : noAddress
      ? t("addressPicker.noSavedAddress")
      : t("addressPicker.hint");

  return (
    <div>
      <Field
        label={t("addressPicker.label")}
        htmlFor="saved-address-picker"
        hint={hint}
        bindChild={false}
      >
        <SearchableSelect
          id="saved-address-picker"
          placeholder={t("addressPicker.placeholder")}
          disabled={empty}
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
      {noAddress && (
        <Link
          to="/customers/$id/addresses/new"
          params={{ id: customerId }}
          className="mt-1 inline-block text-help text-primary hover:underline"
        >
          {t("addressPicker.addForCustomer")}
        </Link>
      )}
    </div>
  );
}
