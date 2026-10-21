/**
 * Numbers as people here read them: a comma for decimals, no "1.0000" that
 * reads as one thousand, and phone numbers grouped the way they are said.
 */
import { describe, expect, it } from "vitest";
import { formatDecimal, formatPhone, telHref } from "@/lib/format";

describe("formatDecimal", () => {
  it("uses a comma and drops trailing zeros", () => {
    expect(formatDecimal("1.0000")).toBe("1");
    expect(formatDecimal("0.63")).toBe("0,63");
    expect(formatDecimal("2.5000")).toBe("2,5");
    expect(formatDecimal("1250.5")).toBe("1.250,5");
  });

  it("is empty for nothing", () => {
    expect(formatDecimal(null)).toBe("");
    expect(formatDecimal("")).toBe("");
  });
});

describe("formatPhone", () => {
  it("groups a Turkish number however it arrived", () => {
    expect(formatPhone("+905321000000")).toBe("0532 100 00 00");
    expect(formatPhone("05321000000")).toBe("0532 100 00 00");
    expect(formatPhone("5321000000")).toBe("0532 100 00 00");
    expect(formatPhone("0442 000 00 00")).toBe("0442 000 00 00");
  });

  it("leaves a number it does not recognise as it came", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("")).toBe("");
  });

  it("builds a tel: link from digits only", () => {
    expect(telHref("0532 100 00 00")).toBe("tel:05321000000");
    expect(telHref("+90 532 100 00 00")).toBe("tel:+905321000000");
  });
});
