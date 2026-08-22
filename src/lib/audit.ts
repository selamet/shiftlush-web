/**
 * Turning an audit row into a line a person can read.
 *
 * The trail stores what changed, not a sentence about it: an action and the
 * columns that moved. Composing the sentence here rather than on the server
 * keeps the API free of user-facing prose — the same reason errors are codes —
 * and means a second language changes one translation file, not a table.
 */
import type { TFunction } from "i18next";
import type { AuditEntry } from "@/api/queries";

/** Columns that are noise in a history list: bookkeeping, not decisions. */
const IGNORED = new Set(["updated_at", "created_at", "id", "company", "company_id"]);

/**
 * The field labels a screen already has, e.g. "elevator" → `elevator.fields.*`.
 * Falls back to the raw column name, which is ugly but honest: better a reader
 * sees `pit_depth_mm` than a confident label for the wrong field.
 */
function fieldLabel(table: string, column: string, t: TFunction): string {
  const camel = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  const key = `${table}.fields.${camel}`;
  const label = t(key);
  return label === key ? column : label;
}

export function changedFields(entry: AuditEntry): string[] {
  const values = (entry.new_values ?? {}) as Record<string, unknown>;
  return Object.keys(values).filter((column) => !IGNORED.has(column));
}

export function describeAuditEntry(entry: AuditEntry, t: TFunction): string {
  if (entry.action === "create") return t("audit.actions.create");
  if (entry.action === "delete") return t("audit.actions.delete");

  const fields = changedFields(entry);
  if (fields.length === 0) return t("audit.actions.update");
  return fields.map((column) => fieldLabel(entry.table_name, column, t)).join(", ");
}
