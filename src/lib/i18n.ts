import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import tr from "@messages/tr.json";

export const DEFAULT_LOCALE = "tr" as const;

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;

const warned = new Set<string>();

/**
 * Resolves an enum value coming from the API to its display label.
 *
 * The API owns the enum and may add values at any time; a client that has not
 * shipped the new translation must keep working. So an unresolved value falls
 * back to the raw code rather than rendering blank or throwing — see the
 * "unknown enum value" rule in the spec (10.2). Components must go through
 * this helper instead of calling `t()` on enum values directly.
 */
export function enumLabel(namespace: string, value: string | null | undefined): string {
  if (!value) return "";

  const key = `${namespace}.${value}`;
  if (i18n.exists(key)) return i18n.t(key);

  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[i18n] Missing enum label for "${key}" — falling back to the raw value.`);
  }
  return value;
}

/** True when the value has no translation, so callers can mark it visually. */
export function isUnknownEnum(namespace: string, value: string | null | undefined): boolean {
  return Boolean(value) && !i18n.exists(`${namespace}.${value}`);
}
