/**
 * Naming a signed-in device by something its owner recognises.
 *
 * The server stores the raw `User-Agent` header, which is the right thing for
 * it to store and the wrong thing to put on a screen. Nobody reads
 * `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML,
 * like Gecko) Chrome/131.0.0.0 Safari/537.36` and thinks "that is my laptop" —
 * and every one of those tokens is a fingerprint, printed in full next to a
 * time and a date. "Chrome · macOS" answers the only question the row is
 * asking: is this me, or is it not.
 *
 * Deliberately shallow. Version numbers, engine names and device models are all
 * in the header and none of them help someone decide whether to end a session;
 * they only narrow the description of a person until it identifies them.
 *
 * The labels are product names — Chrome, Windows, iOS — so they are not
 * translated and do not belong in messages/tr.json. Nothing that is not a
 * product name is written here: a header this cannot read returns null and the
 * caller shows a translated stand-in.
 */

/**
 * Order is the rule, not a preference.
 *
 * Every Chromium browser claims Chrome and Safari as well as itself, and Chrome
 * claims Safari, so the specific token has to be tried before the general one.
 * Read bottom-up this list is a chain of lies each entry tells about the one
 * below it.
 */
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdge?[A-Za-z]*\//, "Edge"],
  [/\bOPR\/|\bOpera\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

/**
 * Same rule, same reason. An Android header says Linux, an iPhone header says
 * `like Mac OS X`, and a Chromebook says X11 — so the narrow platform is tried
 * before the family it is pretending to belong to.
 */
const PLATFORMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bWindows NT\b/, "Windows"],
  [/\bAndroid\b/, "Android"],
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b|\bX11\b/, "Linux"],
];

function first(table: ReadonlyArray<readonly [RegExp, string]>, subject: string): string | null {
  for (const [pattern, name] of table) if (pattern.test(subject)) return name;
  return null;
}

/**
 * "Chrome · macOS", or one half of it, or null when the header says neither.
 *
 * Null rather than a guess or a truncated header: a row labelled with the first
 * forty characters of a user-agent string is not a device anyone recognises,
 * and it reads as a fault in the product rather than as a header nobody has
 * taught this to parse.
 */
export function deviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const parts = [first(BROWSERS, userAgent), first(PLATFORMS, userAgent)].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}
