import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Columns3, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { ListMenu, ListMenuLabel, ListMenuOption } from "./ListMenu";

/**
 * Which columns a list shows, and which one stays put while the rest scroll.
 *
 * Kept out of the URL deliberately. The URL is the thing people send each
 * other — the footer of every list says so — and a link that also imposed the
 * sender's column layout on the reader would make a shared filter feel like a
 * hijacked screen. Column choice is a personal preference about one person's
 * screen width, not part of the question being asked of the data.
 *
 * So it lives in `localStorage`, keyed by the route. It survives a refresh and
 * a new tab, it is per device, and it needs no server: the API has no
 * user-preferences resource, and inventing one to remember a hidden column
 * would be a migration and an endpoint for something a browser already stores.
 * Every access is guarded — a browser with site data blocked throws on the
 * accessor itself, and a list that cannot render because of a column
 * preference would be a poor trade.
 */

interface ColumnLike {
  key: string;
  sticky?: boolean;
}

interface StoredPreferences {
  hidden?: string[];
  /** `undefined` means the list's own default; `null` means nothing is pinned. */
  pinned?: string | null;
}

const STORAGE_PREFIX = "shiftlush.list-columns:";

function read(storageKey: string, columns: readonly ColumnLike[]): StoredPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as StoredPreferences;
    // Columns come and go — a role that cannot see the fee column does not have
    // it, and a release may rename one. Anything the current list does not
    // recognise is dropped rather than kept as a key that hides nothing.
    const known = new Set(columns.map((column) => column.key));
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((key) => known.has(key))
      : [];
    const stored = parsed.pinned;
    const usable =
      typeof stored === "string" && known.has(stored) && !hidden.includes(stored)
        ? stored
        : undefined;
    const pinned = stored === null ? null : usable;

    return { hidden, pinned };
  } catch {
    return {};
  }
}

function write(storageKey: string, preferences: StoredPreferences): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(preferences));
  } catch {
    // A preference that cannot be remembered is not a reason to stop working.
  }
}

export interface ColumnPreferences {
  isHidden: (key: string) => boolean;
  hiddenCount: number;
  /** The column that stays put on horizontal scroll, or null when none does. */
  pinnedKey: string | null;
  toggle: (key: string) => void;
  pin: (key: string) => void;
}

export function useColumnPreferences(
  storageKey: string,
  columns: readonly ColumnLike[],
): ColumnPreferences {
  const [stored, setStored] = useState<StoredPreferences>(() => read(storageKey, columns));
  // Two list screens are two components, so this only fires if a route ever
  // reuses one. Re-reading is still cheaper than the bug where it does not.
  const [readKey, setReadKey] = useState(storageKey);
  if (readKey !== storageKey) {
    setReadKey(storageKey);
    setStored(read(storageKey, columns));
  }

  const hidden = stored.hidden ?? [];
  const fallback = columns.find((column) => column.sticky)?.key ?? null;
  const pinnedKey = stored.pinned === undefined ? fallback : stored.pinned;

  const save = (next: StoredPreferences) => {
    setStored(next);
    write(storageKey, next);
  };

  return {
    isHidden: (key) => hidden.includes(key),
    hiddenCount: hidden.length,
    pinnedKey,
    toggle: (key) => {
      const showing = hidden.includes(key);
      // A table with no columns is not a table. The control that would do it is
      // disabled, so this only catches a stored preference that predates a
      // column being removed.
      if (!showing && columns.length - hidden.length <= 1) return;
      const next = showing ? hidden.filter((one) => one !== key) : [...hidden, key];
      save({
        hidden: next,
        // Pinning a column that is no longer shown would freeze empty space.
        pinned: pinnedKey && next.includes(pinnedKey) ? null : pinnedKey,
      });
    },
    pin: (key) => save({ hidden, pinned: pinnedKey === key ? null : key }),
  };
}

export function ColumnMenu({
  columns,
  preferences,
  className,
}: {
  columns: readonly ColumnLike[];
  preferences: ColumnPreferences;
  className?: string;
}) {
  const { t } = useTranslation();
  const visible = columns.filter((column) => !preferences.isHidden(column.key));
  const addable = columns.filter((column) => preferences.isHidden(column.key));

  return (
    <ListMenu
      label={t("list.columns")}
      icon={<Columns3 className="size-4 shrink-0" aria-hidden="true" />}
      align="end"
      className={className}
      active={preferences.hiddenCount > 0}
      panel={() => (
        <>
          <ListMenuLabel>{t("list.visibleColumns")}</ListMenuLabel>
          {visible.map((column) => (
            <ListMenuOption
              key={column.key}
              checked
              // The last one standing cannot be hidden.
              disabled={visible.length === 1}
              onSelect={() => preferences.toggle(column.key)}
              trailing={
                <button
                  type="button"
                  aria-label={t("list.pinColumn")}
                  aria-pressed={preferences.pinnedKey === column.key}
                  onClick={() => preferences.pin(column.key)}
                  className={cn(
                    "shrink-0 rounded-sm px-1.5 py-0.5 text-help transition-colors focus-ring",
                    preferences.pinnedKey === column.key
                      ? "bg-primary-soft text-primary"
                      : "text-subtle opacity-60 hover:bg-muted hover:opacity-100",
                  )}
                >
                  {preferences.pinnedKey === column.key ? (
                    t("list.pinnedColumn")
                  ) : (
                    <Pin className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              }
            >
              {t(column.key)}
            </ListMenuOption>
          ))}

          {addable.length > 0 && (
            <>
              <ListMenuLabel>{t("list.addableColumns")}</ListMenuLabel>
              {addable.map((column) => (
                <ListMenuOption
                  key={column.key}
                  checked={false}
                  onSelect={() => preferences.toggle(column.key)}
                >
                  {t(column.key)}
                </ListMenuOption>
              ))}
            </>
          )}
        </>
      )}
    >
      {t("list.columns")}
    </ListMenu>
  );
}
