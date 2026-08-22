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

interface UseSubmitOptions<TInput, TResult> {
  mutationFn: (input: TInput) => Promise<TResult>;
  /** Query keys to invalidate on success, so lists do not show stale rows. */
  invalidate?: QueryKey[];
  onSuccess?: (result: TResult) => void;
}

export function useSubmit<TInput, TResult>({
  mutationFn,
  invalidate = [],
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
      const byField = fieldErrors(error, t);
      setFields(byField);
      // A field-level failure is already shown against its input; repeating it
      // at the top of the form says the same thing twice and buries the case
      // where something went wrong that belongs to no field at all.
      if (Object.keys(byField).length === 0) {
        setMessage(errorMessage(error, t));
        setReference(supportReference(error));
      } else if (error instanceof ApiError && error.details.some((d) => !d.field)) {
        setMessage(errorMessage(error, t));
      }
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
