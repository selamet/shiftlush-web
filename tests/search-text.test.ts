/**
 * How a search box compares what was typed with what is listed.
 *
 * Turkish casing and the letters people leave out: "istanbul" has to find
 * "İstanbul", "cayir" has to find "Çayır", and "ISPARTA" has to find
 * "Isparta" — each a search that silently came back empty before.
 */
import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeForSearch } from "@/lib/search-text";

describe("normalizeForSearch", () => {
  it("lowers in Turkish, so İ and I land on the right letters", () => {
    expect(normalizeForSearch("İstanbul")).toBe("istanbul");
    expect(normalizeForSearch("ISPARTA")).toBe("isparta");
    expect(normalizeForSearch("Iğdır")).toBe("igdir");
  });

  it("folds the Turkish letters onto the Latin ones people type", () => {
    expect(normalizeForSearch("Çayır")).toBe("cayir");
    expect(normalizeForSearch("Şişli")).toBe("sisli");
    expect(normalizeForSearch("Göztepe Üsküdar")).toBe("goztepe uskudar");
    expect(normalizeForSearch("Ağrı")).toBe("agri");
  });

  it("strips other accents and squeezes spaces", () => {
    expect(normalizeForSearch("  Kâğıthane   Merkez ")).toBe("kagithane merkez");
  });
});

describe("matchesSearch", () => {
  it("finds a label whatever the case or the Turkish letters typed", () => {
    expect(matchesSearch("istanbul", "İstanbul")).toBe(true);
    expect(matchesSearch("ISTANBUL", "İstanbul")).toBe(true);
    expect(matchesSearch("cayir", "Çayır Mahallesi")).toBe(true);
    expect(matchesSearch("çayır", "cayir")).toBe(true);
  });

  it("matches every typed word, in any order, across the label and its hint", () => {
    expect(matchesSearch("kadikoy moda", "Moda", "Kadıköy, İstanbul")).toBe(true);
    expect(matchesSearch("kadikoy besiktas", "Moda", "Kadıköy, İstanbul")).toBe(false);
  });

  it("matches everything when nothing is typed", () => {
    expect(matchesSearch("   ", "Anything")).toBe(true);
  });
});
