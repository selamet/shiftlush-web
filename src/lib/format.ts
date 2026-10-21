import { DEFAULT_LOCALE } from "./i18n";

const TIME_ZONE = "Europe/Istanbul";

const dateFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

const numberFormatter = new Intl.NumberFormat(DEFAULT_LOCALE);

/** The API sends UTC ISO 8601; localisation happens only here. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return dateTimeFormatter.format(new Date(iso));
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "";
  return numberFormatter.format(value);
}

/**
 * Money arrives from the API as a string to avoid float drift, and stays a
 * string all the way to Intl — it is never parsed into a Number.
 */
export function formatMoney(amount: string | null | undefined, currency = "TRY"): string {
  if (!amount) return "";
  // Handed to Intl as the string itself. Intl formats a decimal string
  // exactly; `Number(amount)` would round anything past fifteen significant
  // digits before a single character was printed. The type definitions still
  // describe only numbers, hence the cast.
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
  }).format(amount as unknown as number);
}

export function formatPercent(rate: string | null | undefined): string {
  if (!rate) return "";
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(Number(rate) / 100);
}

/**
 * A file size a person can judge at a glance.
 *
 * The API reports bytes, which is the right thing for it to report and the
 * wrong thing to put on a screen: nobody reads 2411724 as "about two and a
 * half megabytes".
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(kilobytes / 1024)} MB`;
}

/**
 * A decimal from the API — "1.0000", "0.63" — as people here read one: a comma
 * for the decimal, trailing zeros dropped, so a quantity of one reads "1" and
 * not "1.0000", which in Turkish notation is one thousand. The string goes to
 * Intl as it is, so nothing is rounded on the way.
 */
export function formatDecimal(value: string | number | null | undefined, maximumFractionDigits = 4): string {
  if (value === null || value === undefined || value === "") return "";
  return new Intl.NumberFormat(DEFAULT_LOCALE, { maximumFractionDigits }).format(
    value as unknown as number,
  );
}

/**
 * A Turkish phone number grouped the way it is said: "0532 100 00 00".
 *
 * Numbers arrive in E.164 ("+905321000000") or as typed. A Turkish number —
 * ten digits after the country code or the leading zero — is regrouped; any
 * other number is shown as it came, because guessing a foreign format is worse
 * than not grouping it.
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("90") && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith("0") && digits.length === 11
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;
  if (!national) return value.trim();
  return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`;
}

/** The same number for a `tel:` link: digits and a leading plus, nothing else. */
export function telHref(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}
