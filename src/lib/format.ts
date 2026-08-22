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
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency,
  }).format(Number(amount));
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
