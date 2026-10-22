/**
 * The building's answer at the end of a visit (visit signature spec).
 *
 * Plain functions over the form's state, so what blocks a submit and what is
 * sent can be read by the unit suite. The server holds the same rules; these
 * only keep the button honest about why it is not live yet.
 */
import type { MaintenanceVisitStatus } from "@/api/enums";
import type { MaintenanceVisitWrite } from "@/api/queries";

export type SignatureChoice = "signed" | "not_present" | "declined";
export type SignerRole = "manager" | "caretaker" | "staff" | "other";
export const SIGNER_ROLES: readonly SignerRole[] = ["manager", "caretaker", "staff", "other"];

export interface SignatureAnswer {
  /** Nothing chosen yet: a preselected answer is a signature nobody gave. */
  choice: SignatureChoice | null;
  name: string;
  role: SignerRole | "";
  /** Whether the pad has any stroke on it. */
  hasInk: boolean;
}

export const EMPTY_SIGNATURE: SignatureAnswer = { choice: null, name: "", role: "", hasInk: false };

/** What is still missing, first thing first, or null when the answer is whole. */
export function signatureBlocker(
  status: MaintenanceVisitStatus,
  answer: SignatureAnswer,
): "choose" | "ink" | "name" | "role" | null {
  if (answer.choice === null) return status === "completed" ? "choose" : null;
  if (answer.choice !== "signed") return null;
  if (!answer.hasInk) return "ink";
  if (!answer.name.trim()) return "name";
  if (!answer.role) return "role";
  return null;
}

type SignatureBody = Pick<MaintenanceVisitWrite, "signature_status" | "signer_name" | "signer_role" | "signed_at">;

/** The fields the visit is sent with; `signedAt` is the moment the pad was accepted. */
export function signatureFields(answer: SignatureAnswer, signedAt: string): SignatureBody {
  if (answer.choice === null) return {};
  if (answer.choice !== "signed") return { signature_status: answer.choice };
  return {
    signature_status: "signed",
    signer_name: answer.name.trim(),
    signer_role: answer.role as SignerRole,
    signed_at: signedAt,
  };
}
