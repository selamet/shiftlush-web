import type { components } from "@/api/generated";

type Schemas = components["schemas"];

export type BuildingType = Schemas["BuildingType"];
export type CustomerType = Schemas["CustomerType"];
export type ContactRole = Schemas["ContactRole"];
export type ContractScope = Schemas["ContractScope"];
export type PricingType = Schemas["PricingTypeEnum"];
export type BillingPeriod = Schemas["BillingPeriodEnum"];

/**
 * Binds a hand-written option list to the enum the API declares.
 *
 * A plain `satisfies readonly Enum[]` catches only half of what can go wrong:
 * it rejects a value the server would refuse, and says nothing about a value
 * the server accepts that the form never offers. The building type managed
 * both at once — it sent `mixed` for `mixed_use`, so those records could not
 * be saved at all, and it hid four types no screen could reach. Neither
 * surfaced until a write was refused, because a hand-written array agrees with
 * nothing.
 *
 * Curried because TypeScript infers all type arguments or none: the enum is
 * named, the values are inferred.
 *
 *     const TYPES = allOf<BuildingType>()(["residential", "commercial"]);
 *     //                                  ^ missing seven — does not compile
 */
export function allOf<Enum extends string>() {
  return <const Values extends readonly Enum[]>(
    values: Exclude<Enum, Values[number]> extends never
      ? Values
      : // Not `never`: the compiler prints the type it expected, so naming the
        // gap here is what turns the error into the list of what is missing.
        { readonly __missingFromThisList: Exclude<Enum, Values[number]> },
    // The compiler cannot see that the conditional resolved to `Values` while
    // `Enum` is still generic, so the narrowing it just performed has to be
    // asserted back. The check above is the real guarantee.
  ): Values => values as Values;
}
