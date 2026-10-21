import type { components } from "@/api/generated";

type Schemas = components["schemas"];

export type BuildingType = Schemas["BuildingType"];
export type CustomerType = Schemas["CustomerType"];
export type ContactRole = Schemas["ContactRole"];
export type ContractScope = Schemas["ContractScope"];
export type PricingType = Schemas["PricingTypeEnum"];
export type BillingPeriod = Schemas["BillingPeriodEnum"];
/* The three a maintenance visit is recorded with. All three are choices the
   visit form offers — the status picker and every checklist row — and are
   bound to their option lists in lib/visit.ts through `allOf` below. */
export type MaintenanceVisitStatus = Schemas["MaintenanceVisitStatus"];
export type MaintenanceChecklistItem = Schemas["MaintenanceChecklistItem"];
export type MaintenanceChecklistResult = Schemas["MaintenanceChecklistResult"];
/* A plan row's state. Not chosen by anyone on a form — the plan job writes
   `planned`, a recorded visit makes it `done` — but the plan screen filters by
   it, and the filter's option list is bound to it like any other. */
export type PlannedVisitStatus = Schemas["PlannedVisitStatus"];
/* A fault's priority is chosen on the staff form; its status is the server's,
   moved only by the transition endpoints, and listed here for the filter. */
export type FaultPriority = Schemas["FaultPriority"];
export type FaultStatus = Schemas["FaultStatus"];
/* The four labels an inspection can give — the lift's own field adds `none`
   for "never inspected", which no inspection records. */
export type InspectionResultLabel = Schemas["InspectionResultLabel"];
export type InspectionKind = Schemas["InspectionKind"];
/* `VatStatusEnum` is deliberately not listed here. Every type above names a set
   of options a form offers, which is what `allOf` below exists to bind. VAT
   status is nobody's choice — the server derives it from `vat_rate` and sends
   it read-only — so it is read off the record as `contract.vat_status` and
   never picked from a list. See `vatUnstated` in lib/contract.ts. */

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
