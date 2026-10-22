/**
 * The building's answer on a visit: what blocks sending it, and what it sends.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_SIGNATURE, signatureBlocker, signatureFields, type SignatureAnswer } from "@/lib/signature";

const signed: SignatureAnswer = { choice: "signed", name: "Ayşe Yılmaz", role: "manager", hasInk: true };

describe("signatureBlocker", () => {
  it("asks a completed visit for an answer", () => {
    expect(signatureBlocker("completed", EMPTY_SIGNATURE)).toBe("choose");
    expect(signatureBlocker("incomplete", EMPTY_SIGNATURE)).toBeNull();
  });

  it("takes nobody-there and declined as answers", () => {
    expect(signatureBlocker("completed", { ...EMPTY_SIGNATURE, choice: "not_present" })).toBeNull();
    expect(signatureBlocker("completed", { ...EMPTY_SIGNATURE, choice: "declined" })).toBeNull();
  });

  it("wants ink, a name and a role for a signature, on any visit", () => {
    expect(signatureBlocker("completed", signed)).toBeNull();
    expect(signatureBlocker("completed", { ...signed, hasInk: false })).toBe("ink");
    expect(signatureBlocker("incomplete", { ...signed, name: "  " })).toBe("name");
    expect(signatureBlocker("completed", { ...signed, role: "" })).toBe("role");
  });
});

describe("signatureFields", () => {
  it("sends the signer and the moment for a signature", () => {
    expect(signatureFields(signed, "2026-10-22T09:15:00.000Z")).toEqual({
      signature_status: "signed",
      signer_name: "Ayşe Yılmaz",
      signer_role: "manager",
      signed_at: "2026-10-22T09:15:00.000Z",
    });
  });

  it("sends only the reason otherwise, and nothing with no answer", () => {
    expect(signatureFields({ ...signed, choice: "declined" }, "x")).toEqual({ signature_status: "declined" });
    expect(signatureFields(EMPTY_SIGNATURE, "x")).toEqual({});
  });
});
