/**
 * Turning a server error into a sentence.
 *
 * The backend sends codes and no prose, so this is where the two halves meet.
 * Every code has a Turkish message in `messages/tr.json` and CI fails the build
 * if one is missing — see `scripts/check-error-codes.mjs`. That check is what
 * makes the fallback below rare rather than routine.
 */
import type { TFunction } from "i18next";
import { ApiError } from "@/api/client";

/**
 * The message to show for a failure.
 *
 * Takes `unknown` deliberately: a catch block receives whatever was thrown, and
 * forcing every call site to narrow the type first is how a screen ends up
 * rendering "[object Object]".
 */
export function errorMessage(error: unknown, t: TFunction): string {
  const code = error instanceof ApiError ? error.code : "UNKNOWN_ERROR";
  const message = t(`errors.${code}`);

  // i18next returns the key path when there is no entry. Showing
  // "errors.SOME_CODE" to a user is worse than a generic sentence, and it is
  // the failure mode this guard exists for.
  return message === `errors.${code}` ? t("errors.UNKNOWN_ERROR") : message;
}

/**
 * The request id, for the support line.
 *
 * Shown next to unexpected failures only. Printing it under a validation error
 * the user can fix themselves is noise that trains people to ignore it.
 */
export function supportReference(error: unknown): string {
  if (!(error instanceof ApiError)) return "";
  return error.status >= 500 || error.code === "INTERNAL_ERROR" ? error.requestId : "";
}

/** Field name → message, for putting errors next to the inputs that caused them. */
export function fieldErrors(error: unknown, t: TFunction): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const messages: Record<string, string> = {};
  for (const [field, code] of Object.entries(error.byField())) {
    const message = t(`errors.${code}`);
    messages[field] = message === `errors.${code}` ? t("errors.VALIDATION_ERROR") : message;
  }
  return messages;
}
