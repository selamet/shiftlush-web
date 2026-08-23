/**
 * Where a rejected submission gets shown.
 *
 * The server is the only validator, so everything a user is told about a form
 * they got wrong comes back as codes and is placed by this one decision. Put an
 * error in the wrong place and the user is either told nothing at all — the
 * form just refuses, silently — or told the same thing twice while the sentence
 * that actually explains the refusal sits somewhere they are not looking.
 *
 * These run against the real message catalogue and the real i18next instance,
 * not a stub of one. The fallbacks under test are i18next's own behaviour —
 * a missing key resolves to the key path — and a stub that reimplemented that
 * would be testing the stub. Messages are compared by key rather than by
 * literal so that rewording a sentence in messages/tr.json is not a test
 * failure; what is asserted is *which* message, never its wording.
 */
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import { ApiError } from "@/api/client";
import { submitFailure } from "@/lib/form";
import i18n from "@/lib/i18n";

const t = i18n.t as unknown as TFunction;

const validation = (details: { field?: string; code: string }[], requestId = "") =>
  new ApiError({ code: "VALIDATION_ERROR", status: 422, requestId, details });

describe("a failure that belongs to a field", () => {
  it("puts each message next to its own input and leaves the form quiet", () => {
    const failure = submitFailure(
      validation([
        { field: "tax_number", code: "INVALID_TAX_NUMBER" },
        { field: "postal_code", code: "INVALID_POSTAL_CODE" },
      ]),
      t,
    );

    expect(failure.fields).toEqual({
      tax_number: t("errors.INVALID_TAX_NUMBER"),
      postal_code: t("errors.INVALID_POSTAL_CODE"),
    });
    // Already said next to the input. Saying it again at the top of the form is
    // noise, and it buries anything that belongs to no field.
    expect(failure.message).toBe("");
    expect(failure.reference).toBe("");
  });

  it("shows a real sentence, not the key it was looked up under", () => {
    const failure = submitFailure(validation([{ field: "email", code: "EMAIL_ALREADY_REGISTERED" }]), t);

    expect(failure.fields.email).not.toMatch(/^errors\./);
    expect(failure.fields.email.length).toBeGreaterThan(0);
  });

  it("falls back to the generic validation message for a code it has never seen", () => {
    // The API owns the enum and may add a code before the client ships its
    // translation. "errors.SOMETHING_NEW" printed against an input is worse
    // than a generic sentence.
    const failure = submitFailure(validation([{ field: "iban", code: "CODE_ADDED_AFTER_THIS_BUILD" }]), t);

    expect(failure.fields.iban).toBe(t("errors.VALIDATION_ERROR"));
  });

  it("ignores a detail that names no field when building the field map", () => {
    const failure = submitFailure(
      validation([{ field: "email", code: "EMAIL_ALREADY_REGISTERED" }, { code: "ACCOUNT_LOCKED" }]),
      t,
    );

    expect(Object.keys(failure.fields)).toEqual(["email"]);
  });
});

describe("a failure that belongs to no field", () => {
  it("shows it at the top of the form", () => {
    const failure = submitFailure(new ApiError({ code: "PERMISSION_DENIED", status: 403 }), t);

    expect(failure.fields).toEqual({});
    expect(failure.message).toBe(t("errors.PERMISSION_DENIED"));
    // A permission is not a fault the user should be quoting to support.
    expect(failure.reference).toBe("");
  });

  it("carries the request id for a fault the user cannot act on", () => {
    const failure = submitFailure(
      new ApiError({ code: "INTERNAL_ERROR", status: 500, requestId: "req-77" }),
      t,
    );

    expect(failure.message).toBe(t("errors.INTERNAL_ERROR"));
    expect(failure.reference).toBe("req-77");
  });

  it("reports a dropped connection as the connection, with no reference", () => {
    const failure = submitFailure(new ApiError({ code: "NETWORK_ERROR", status: 0 }), t);

    expect(failure.message).toBe(t("errors.NETWORK_ERROR"));
    expect(failure.reference).toBe("");
  });

  it("survives something that is not an ApiError at all", () => {
    // What reached this before the client.ts fix: a raw TypeError from the
    // post-refresh retry. It resolves to the generic sentence rather than
    // throwing on `error.details`, which is the only reason the bug read as a
    // vague failure rather than a crash.
    const failure = submitFailure(new TypeError("Failed to fetch"), t);

    expect(failure.fields).toEqual({});
    expect(failure.message).toBe(t("errors.UNKNOWN_ERROR"));
    expect(failure.reference).toBe("");
  });

  it("falls back to the generic sentence for a code it has never seen", () => {
    const failure = submitFailure(
      new ApiError({ code: "CODE_ADDED_AFTER_THIS_BUILD" as never, status: 409 }),
      t,
    );

    expect(failure.message).toBe(t("errors.UNKNOWN_ERROR"));
  });
});

describe("a code the form claims as one of its fields", () => {
  // Changing a password is the case this exists for. INVALID_CREDENTIALS
  // arrives as a top-level code and the server is right to send it that way,
  // but on a form with two password boxes a banner over the top says nothing
  // about which of them to retype.
  const routing = { INVALID_CREDENTIALS: "current_password" };

  it("puts it on the field, and not also at the top of the form", () => {
    const failure = submitFailure(
      new ApiError({ code: "INVALID_CREDENTIALS", status: 401 }),
      t,
      routing,
    );

    expect(failure.fields).toEqual({ current_password: t("errors.INVALID_CREDENTIALS") });
    // Shouting it as well would point at the whole form for a fault that has an
    // input to sit next to.
    expect(failure.message).toBe("");
    expect(failure.reference).toBe("");
  });

  it("leaves a code the form has not claimed at the top, where it was", () => {
    const failure = submitFailure(new ApiError({ code: "ACCOUNT_LOCKED", status: 403 }), t, routing);

    expect(failure.fields).toEqual({});
    expect(failure.message).toBe(t("errors.ACCOUNT_LOCKED"));
  });

  it("never writes over what the server itself said about that field", () => {
    const failure = submitFailure(
      new ApiError({
        code: "INVALID_CREDENTIALS",
        status: 401,
        details: [{ field: "current_password", code: "ACCOUNT_LOCKED" }],
      }),
      t,
      routing,
    );

    expect(failure.fields.current_password).toBe(t("errors.ACCOUNT_LOCKED"));
  });

  it("routes nothing when the failure has no code to route", () => {
    const failure = submitFailure(new TypeError("Failed to fetch"), t, routing);

    expect(failure.fields).toEqual({});
    expect(failure.message).toBe(t("errors.UNKNOWN_ERROR"));
  });
});

describe("a failure that is both at once", () => {
  it("shows the field part on the field and the rest on the form", () => {
    // The branch that decides this: `details.some(d => !d.field)`. A contract
    // form can be rejected for a date the user can fix *and* for a lift that is
    // already covered by an open contract, which names no input. Without this
    // branch the second is never shown, and the user fixes the date, resubmits,
    // and is refused again for a reason nothing on the screen mentions.
    const failure = submitFailure(
      validation([
        { field: "end_date", code: "END_DATE_BEFORE_START_DATE" },
        { code: "ELEVATOR_ALREADY_CONTRACTED" },
      ]),
      t,
    );

    expect(failure.fields).toEqual({ end_date: t("errors.END_DATE_BEFORE_START_DATE") });
    expect(failure.message).toBe(t("errors.VALIDATION_ERROR"));
    // The reference belongs to faults the user cannot act on; this one they can.
    expect(failure.reference).toBe("");
  });

  it("says nothing extra when every detail names a field", () => {
    // The same shape as above minus the fieldless detail, so the difference the
    // branch makes is the only thing that changed.
    const failure = submitFailure(
      validation([{ field: "end_date", code: "END_DATE_BEFORE_START_DATE" }]),
      t,
    );

    expect(failure.fields).toEqual({ end_date: t("errors.END_DATE_BEFORE_START_DATE") });
    expect(failure.message).toBe("");
  });

  it("does not offer a reference next to field errors, even on a 500", () => {
    const failure = submitFailure(
      new ApiError({
        code: "INTERNAL_ERROR",
        status: 500,
        requestId: "req-88",
        details: [{ field: "email", code: "EMAIL_ALREADY_REGISTERED" }],
      }),
      t,
    );

    expect(failure.fields.email).toBe(t("errors.EMAIL_ALREADY_REGISTERED"));
    expect(failure.reference).toBe("");
  });
});
