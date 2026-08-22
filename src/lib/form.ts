/**
 * Submitting a form to the API.
 *
 * The server is the validator. Not "also" the validator — the only one. It has
 * rules a client cannot reproduce (tax-number check digits, uniqueness within a
 * company, whether an elevator is already covered by an open contract), and
 * every rule duplicated in the browser is a rule that has to be kept in step
 * with the one that actually decides. So there is no schema library here: the
 * form collects values, the server judges them, and what comes back is rendered
 * next to the field that caused it.
 *
 * The browser still marks fields `required`, because refusing to spend a round
 * trip on an empty form is not a second opinion about the rules.
 */
import { useCallback, useState } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ApiError } from "@/api/client";
import { errorMessage, fieldErrors, supportReference } from "@/api/errors";

export interface SubmitState {
  /** True while the request is in flight. Disables the submit control. */
  pending: boolean;
  /** Field name → translated message, for the input that caused it. */
  fields: Record<string, string>;
  /** A failure that belongs to no field: a permission, a conflict, the network. */
  message: string;
  /** Shown only for faults the user cannot act on. */
  reference: string;
}

/**
 * Where a failure gets shown: against a field, at the top of the form, or both.
 *
 * The decision is here rather than inline in the mutation below so that it can
 * be made in one place and read without a renderer around it. The three cases
 * are short; the reason each is what it is, is not obvious from the code.
 *
 * - Nothing belongs to a field. The failure is the form's as a whole — a
 *   permission, a conflict, a dead connection — and the support reference goes
 *   with it, for the faults the user cannot act on.
 * - Everything belongs to a field. The message is already sitting next to the
 *   input that caused it; repeating it at the top says the same thing twice.
 * - Some of it belongs to a field and some of it does not. The part that names
 *   no field has nowhere else to go, so the form has to say it too — otherwise
 *   a rejection like "this company has no seats left" arrives invisible,
 *   alongside a field error the user can see and fix without fixing anything.
 *
 * `fieldForCode` lets a form claim a top-level code as one of its fields' —
 * see the option of the same name on `useSubmit` for why a form may know
 * something about a code that the server correctly refuses to assume.
 */
export function submitFailure(
  error: unknown,
  t: TFunction,
  fieldForCode?: Record<string, string>,
): Omit<SubmitState, "pending"> {
  const fields = fieldErrors(error, t);

  // Applied before the count below, which is what decides between a field error
  // and a banner: a code routed to a field must not also be shouted at the top
  // of the form.
  const routed = error instanceof ApiError ? fieldForCode?.[error.code] : undefined;
  // Never over the top of what the server actually said about that field.
  if (routed && !fields[routed]) fields[routed] = errorMessage(error, t);

  if (Object.keys(fields).length === 0) {
    return { fields, message: errorMessage(error, t), reference: supportReference(error) };
  }
  if (error instanceof ApiError && error.details.some((detail) => !detail.field)) {
    return { fields, message: errorMessage(error, t), reference: "" };
  }
  return { fields, message: "", reference: "" };
}

interface UseSubmitOptions<TInput, TResult> {
  mutationFn: (input: TInput) => Promise<TResult>;
  /** Query keys to invalidate on success, so lists do not show stale rows. */
  invalidate?: QueryKey[];
  /**
   * Error codes the server sends against no field, which on this form belong
   * to one. Code → field name.
   *
   * Changing a password is the case this exists for. `INVALID_CREDENTIALS`
   * arrives as a top-level code and the server is right to send it that way:
   * "the password you typed is wrong" is a different answer from "the password
   * you chose is unacceptable", and it deliberately refuses to dress the first
   * one up as a validation failure. But on a form with two password boxes, a
   * banner over the top says nothing about which of them to retype. The server
   * owns what happened; the form owns where the user has to look.
   *
   * Only for codes with exactly one possible field. A code that could mean
   * either box would be guessed at here, and a wrong guess points at the field
   * that was fine.
   */
  fieldForCode?: Record<string, string>;
  onSuccess?: (result: TResult) => void;
}

export function useSubmit<TInput, TResult>({
  mutationFn,
  invalidate = [],
  fieldForCode,
  onSuccess,
}: UseSubmitOptions<TInput, TResult>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");

  const mutation = useMutation({
    mutationFn,
    onMutate: () => {
      // Cleared before the attempt, not after it. Leaving the previous errors
      // on screen during a resubmit makes a fixed field look still broken.
      setFields({});
      setMessage("");
      setReference("");
    },
    onSuccess: async (result) => {
      await Promise.all(
        invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
      onSuccess?.(result);
    },
    onError: (error) => {
      // All three are set every time. `onMutate` has already cleared them, so
      // writing "" is what the branches that used to skip a setter were saying.
      const failure = submitFailure(error, t, fieldForCode);
      setFields(failure.fields);
      setMessage(failure.message);
      setReference(failure.reference);
    },
  });

  const submit = useCallback((input: TInput) => mutation.mutate(input), [mutation]);

  return {
    submit,
    state: {
      pending: mutation.isPending,
      fields,
      message,
      reference,
    } satisfies SubmitState,
  };
}

/**
 * A key that makes a retry of *this* submission idempotent.
 *
 * Generated once when the form mounts and reused for every attempt, which is
 * the whole point: a technician on a bad connection taps save, sees nothing,
 * and taps again. A key minted per attempt would make the two attempts look
 * like two different intentions and create two records — exactly the failure
 * the header exists to prevent.
 */
export function useIdempotencyKey(): string {
  const [key] = useState(() => crypto.randomUUID());
  return key;
}

/**
 * Reads a form into a plain object, dropping empty optional fields.
 *
 * An empty string is not the same as "not provided": sending `tax_number: ""`
 * asks the server to validate an empty tax number, and it will refuse. Omitting
 * the key says the field was left blank, which is what the user did.
 */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of new FormData(form).entries()) {
    if (typeof value === "string" && value.trim() !== "") values[name] = value.trim();
  }
  return values;
}
