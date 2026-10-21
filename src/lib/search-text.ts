/**
 * Text as a search compares it: Turkish-aware, and forgiving of the letters
 * people leave out.
 *
 * Two problems, one function. Turkish casing first: the default locale lowers
 * the capital dotted I to an i followed by a combining dot, and the capital
 * dotless I to a dotted i — so the city whose name starts with a dotted capital
 * never matched its own name typed in lower case, and a name in capitals
 * matched the wrong letter. Lowering in the Turkish locale gets the letters
 * right. Then the letters people do not type: on a phone keyboard, or from a
 * habit formed on one, a c-cedilla is typed as c and an s-cedilla as s. So
 * after lowering, each of the six Turkish letters is folded onto the Latin one
 * it is typed as (c-cedilla, soft g, dotless i, o-umlaut, s-cedilla, u-umlaut),
 * and any accent left — a circumflex, the combining dot — is stripped. Both
 * sides of a comparison go through this, so a name finds itself however it was
 * typed. The cases are spelled out in tests/search-text.test.ts, which may
 * contain the Turkish this file may not.
 *
 * The letters are written as escapes because `lint:tr` keeps Turkish
 * characters out of src/.
 */
const FOLDS: Record<string, string> = {
  "\u00e7": "c", // c-cedilla
  "\u011f": "g", // soft g
  "\u0131": "i", // dotless i
  "\u00f6": "o", // o-umlaut
  "\u015f": "s", // s-cedilla
  "\u00fc": "u", // u-umlaut
};

const TURKISH_LETTERS = /[\u00e7\u011f\u0131\u00f6\u015f\u00fc]/g;

export function normalizeForSearch(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(TURKISH_LETTERS, (letter) => FOLDS[letter] ?? letter)
    // Whatever still carries an accent — a circumflex, the combining dot a
    // lowered dotted capital I can leave behind — loses it.
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether an option answers what was typed: every word typed appears in the
 * label or the hint, in any order — a neighbourhood typed with its district
 * finds the row that lists the district as its hint.
 */
export function matchesSearch(query: string, ...haystacks: Array<string | undefined>): boolean {
  const words = normalizeForSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeForSearch(haystacks.filter(Boolean).join(" "));
  return words.every((word) => text.includes(word));
}
