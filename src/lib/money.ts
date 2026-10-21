/**
 * Money as exact decimal strings, never as floating point.
 *
 * The API sends every amount as a string with two decimals ("1250.00") so that
 * nothing between the database and the screen rounds it. Adding those up for
 * a total, or reading what an accountant typed into a price box, must keep
 * that promise — `0.1 + 0.2` is not `0.3` in a Number, and an invoice total a
 * kurus off is a wrong invoice. So amounts are turned into whole kurus as a
 * `bigint`, summed there, and turned back into the API's string form.
 */

const AMOUNT = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "1250.5" → 125050n. Null for anything that is not an amount the API would send. */
export function toKurus(amount: string | null | undefined): bigint | null {
  const match = AMOUNT.exec((amount ?? "").trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const kurus = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return sign ? -kurus : kurus;
}

/** 125050n → "1250.50": the API's own spelling, ready for `formatMoney` or a request body. */
export function fromKurus(kurus: bigint): string {
  const negative = kurus < 0n;
  const absolute = negative ? -kurus : kurus;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** The exact sum of several amounts. Anything unreadable counts as nothing rather than as NaN. */
export function sumMoney(amounts: ReadonlyArray<string | null | undefined>): string {
  let total = 0n;
  for (const amount of amounts) total += toKurus(amount) ?? 0n;
  return fromKurus(total);
}

/**
 * What an accountant typed into a price box, in the form the API takes.
 *
 * People here write "1.250,50": a comma for decimals and dots between the
 * thousands. Some type "1250.50" because a keyboard or a spreadsheet taught
 * them to. Both are read; what is ambiguous is refused rather than guessed —
 * "1.250" with no comma could be one thousand two hundred and fifty or one
 * and a quarter, and the two are a thousand times apart.
 *
 * Returns the API's string ("1250.50"), or null when the text is not a price.
 */
export function parseMoneyInput(text: string): string | null {
  const raw = text.trim().replace(/\s|₺|TL/gi, "");
  if (!raw) return null;
  let normalised: string;
  if (raw.includes(",")) {
    // Comma decimals; dots may only group thousands.
    const [whole, fraction, extra] = raw.split(",");
    if (extra !== undefined || !/^\d{1,3}(\.\d{3})*$|^\d+$/.test(whole)) return null;
    normalised = `${whole.replace(/\./g, "")}.${fraction}`;
  } else if (/^\d+\.\d{1,2}$/.test(raw)) {
    normalised = raw;
  } else if (/^\d+$/.test(raw)) {
    normalised = raw;
  } else {
    return null;
  }
  const kurus = toKurus(normalised);
  return kurus === null || kurus < 0n ? null : fromKurus(kurus);
}

/**
 * A quantity as the API takes it: up to four decimals, comma or point, and
 * more than zero. Returned in the API's spelling, or null.
 */
export function parseQuantityInput(text: string): string | null {
  const raw = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(raw)) return null;
  return Number(raw) > 0 ? raw : null;
}
