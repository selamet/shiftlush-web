/**
 * Money and drafts.
 *
 * Money first, because it is where floating point quietly lies: totals are
 * summed in whole kuruş as bigints, and what an accountant types is read the
 * way people here write numbers — or refused when it could mean two things a
 * thousand times apart.
 */
import { describe, expect, it } from "vitest";
import { fromKurus, parseMoneyInput, parseQuantityInput, sumMoney, toKurus } from "@/lib/money";
import { draftActions, issueBlocker, needsPriceFirst, totalsByStatus } from "@/lib/billing";
import { formatMoney } from "@/lib/format";

describe("money as kuruş", () => {
  it("reads and writes the API's spelling exactly", () => {
    expect(toKurus("1250.50")).toBe(125050n);
    expect(toKurus("0.1")).toBe(10n);
    expect(toKurus("-3.05")).toBe(-305n);
    expect(toKurus("12,50")).toBeNull();
    expect(fromKurus(125050n)).toBe("1250.50");
    expect(fromKurus(-5n)).toBe("-0.05");
  });

  it("sums without floating point drift", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumMoney(["1999.99", "0.01", "12345678901234.56"])).toBe("12345678903234.56");
    expect(sumMoney([])).toBe("0.00");
  });

  it("formats exactly, Turkish style, even past what a Number can hold", () => {
    expect(formatMoney("1234.56")).toBe("₺1.234,56");
    expect(formatMoney("12345678901234567.89")).toBe("₺12.345.678.901.234.567,89");
  });
});

describe("parseMoneyInput", () => {
  it("reads comma decimals with dot thousands, and a plain point", () => {
    expect(parseMoneyInput("1.250,50")).toBe("1250.50");
    expect(parseMoneyInput("1250,5")).toBe("1250.50");
    expect(parseMoneyInput("1250.50")).toBe("1250.50");
    expect(parseMoneyInput("750")).toBe("750.00");
    expect(parseMoneyInput(" 1.250,00 ₺ ")).toBe("1250.00");
  });

  it("refuses what could mean two different prices, and what is not a price", () => {
    expect(parseMoneyInput("1.250")).toBeNull();
    expect(parseMoneyInput("12,5,0")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("1,234")).toBeNull();
  });
});

describe("parseQuantityInput", () => {
  it("takes up to four decimals, comma or point, above zero", () => {
    expect(parseQuantityInput("1")).toBe("1");
    expect(parseQuantityInput("0,5")).toBe("0.5");
    expect(parseQuantityInput("2.25")).toBe("2.25");
    expect(parseQuantityInput("0")).toBeNull();
    expect(parseQuantityInput("1.23456")).toBeNull();
  });
});

describe("draftActions", () => {
  it("lets a draft be edited, issued or cancelled", () => {
    expect(draftActions("draft", "accountant")).toEqual(["pdf", "editLines", "issue", "cancel"]);
  });

  it("makes an issued draft read-only: paid or cancelled, nothing else", () => {
    expect(draftActions("issued", "owner")).toEqual(["pdf", "markPaid", "cancel"]);
  });

  it("leaves paid and cancelled drafts as history, and gives other roles nothing", () => {
    expect(draftActions("paid", "admin")).toEqual(["pdf"]);
    expect(draftActions("cancelled", "admin")).toEqual(["pdf"]);
    expect(draftActions("draft", "operations")).toEqual([]);
    expect(draftActions("draft", "technician")).toEqual([]);
  });
});

describe("issueBlocker", () => {
  it("names how many lines still need a price", () => {
    expect(issueBlocker([{ needs_price: true }, { needs_price: false }, { needs_price: true }])).toEqual({
      unpriced: 2,
    });
    expect(issueBlocker([{ needs_price: false }])).toBeNull();
  });
});

describe("the list", () => {
  it("puts drafts needing a price first, otherwise keeping the server's order", () => {
    const rows = [
      { id: "a", needs_price: false },
      { id: "b", needs_price: true },
      { id: "c", needs_price: false },
      { id: "d", needs_price: true },
    ];
    expect(needsPriceFirst(rows).map((row) => row.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("totals each status exactly, and leaves out statuses with nothing in them", () => {
    expect(
      totalsByStatus([
        { status: "draft", total: "1500.10" },
        { status: "draft", total: "0.20" },
        { status: "paid", total: "300.00" },
      ]),
    ).toEqual([
      { status: "draft", count: 2, total: "1500.30" },
      { status: "paid", count: 1, total: "300.00" },
    ]);
  });
});
