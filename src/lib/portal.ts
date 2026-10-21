/**
 * The decisions the customer portal makes, as plain functions (M6).
 *
 * What a building manager is told about each of their lifts, which faults
 * count as still open, and — on the office side — what can be done about each
 * contact's portal access. Small rules, each with a person on the other end
 * who reads the result and acts on it, so each is checked by the unit suite
 * rather than trusted to a screen.
 */
import type { components } from "@/api/generated";

type Schemas = components["schemas"];
type FaultStatus = Schemas["FaultStatus"];
type PortalAccount = Schemas["PortalAccount"];

/** A fault the manager is still waiting on: reported and not yet fixed. */
export function isOpenFault(status: FaultStatus): boolean {
  return status === "open" || status === "assigned" || status === "on_site";
}

export type LiftAttention =
  | "out_of_service"
  | "fault"
  | "inspection_overdue"
  | "maintenance_overdue"
  | "ok";

/**
 * The one thing to say first about a lift, most serious first.
 *
 * A lift that is not running is what the manager is fielding calls about, so
 * it leads; an open fault is the next thing they want news of; an inspection
 * past its date is a legal matter for the building; a late maintenance visit
 * is the firm's to chase. Otherwise, nothing to worry about — said as such,
 * because a manager reading a list of lifts wants to know that too.
 */
export function liftAttention(
  lift: { id: string; status: string; next_inspection_date: string | null; next_maintenance_date: string | null },
  faults: ReadonlyArray<{ elevator: string; status: FaultStatus }>,
  today: string,
): { attention: LiftAttention; openFaults: number } {
  const openFaults = faults.filter((fault) => fault.elevator === lift.id && isOpenFault(fault.status)).length;
  let attention: LiftAttention = "ok";
  if (lift.status === "out_of_service" || lift.status === "sealed" || lift.status === "suspended") {
    attention = "out_of_service";
  } else if (openFaults > 0) {
    attention = "fault";
  } else if (lift.next_inspection_date && lift.next_inspection_date < today) {
    attention = "inspection_overdue";
  } else if (lift.next_maintenance_date && lift.next_maintenance_date < today) {
    attention = "maintenance_overdue";
  }
  return { attention, openFaults };
}

export type PortalAccessState = "none" | "invited" | "active" | "inactive";

export interface PortalAccess {
  state: PortalAccessState;
  account: PortalAccount | null;
  /** Whether the invite action is offered for this contact. */
  canInvite: boolean;
  /** Why not, when it is not — said beside the contact rather than as a refusal later. */
  blocked: "noEmail" | "alreadyActive" | null;
  canDeactivate: boolean;
}

/**
 * Where one contact stands with the portal, and what the office may do.
 *
 * A contact has at most one account that matters: the newest. An invitation
 * goes to the contact's e-mail, so a contact without one cannot be invited —
 * the server refuses (`CONTACT_HAS_NO_EMAIL`), and the screen says why first.
 * An active account is not re-invited (`PORTAL_ACCOUNT_ALREADY_ACTIVE`); an
 * invitation still waiting, or an account switched off, may be sent again.
 */
export function portalAccessFor(
  contact: { id: string; email: string },
  accounts: readonly PortalAccount[],
): PortalAccess {
  const mine = accounts
    .filter((account) => account.contact === contact.id)
    .sort((a, b) => Date.parse(b.invited_at) - Date.parse(a.invited_at));
  const account = mine[0] ?? null;
  const state: PortalAccessState = account ? account.status : "none";
  const hasEmail = contact.email.trim() !== "";
  const blocked = state === "active" ? "alreadyActive" : hasEmail ? null : "noEmail";
  return {
    state,
    account,
    canInvite: blocked === null,
    blocked,
    canDeactivate: state === "active" || state === "invited",
  };
}

/** Who manages portal access from the customer page — the server's matrix. */
export function canManagePortal(role: string | null): boolean {
  return role === "owner" || role === "admin" || role === "operations";
}
