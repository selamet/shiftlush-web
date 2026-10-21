import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, X } from "lucide-react";
import { matchesSearch } from "@/lib/search-text";
import { cn } from "@/lib/utils";

/**
 * The same interval every other search box in the product uses. Kept as its own
 * constant rather than imported from `ListPage`, which would make a list layout
 * component a dependency of a form control.
 */
const SEARCH_DEBOUNCE_MS = 300;

/** How far the list may grow before it scrolls, and how much room it wants below the field. */
const LIST_MAX_HEIGHT = 280;

export type SearchableOption = {
  value: string;
  label: string;
  /**
   * A second line under the label — the customer a building belongs to, the
   * district and province a neighbourhood sits in. Searched along with the
   * label, because the district is often what someone remembers about a
   * building whose registered name they never learned.
   */
  hint?: string;
};

interface SearchableSelectProps {
  options: SearchableOption[];
  id?: string;
  /**
   * Written to a hidden input, so the surrounding form keeps reading this
   * field out of FormData under the name its `<select>` always used. Every
   * form here is uncontrolled; none of them had to change.
   */
  name?: string;
  /** Controlled use. Leave unset and the component keeps its own selection. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /**
   * The label for a chosen value that is not in `options` — a record being
   * edited whose list is only ever fetched a search at a time, so the value it
   * already holds was never among the options.
   */
  selectedLabel?: string;
  required?: boolean;
  /**
   * Disabled is the native select's disabled, all of it: nothing to open, and
   * the value is left out of the submitted form — a locked field must not be
   * sent back as though somebody chose it.
   */
  disabled?: boolean;
  invalid?: boolean;
  /**
   * A small cross that empties the field. For an optional choice — a filter,
   * "no technician" — where "none" is a real answer; never on a required one.
   */
  clearable?: boolean;
  /** `sm` for a row in a table or a filter bar; `md`, the default, for a form. */
  size?: "sm" | "md";
  className?: string;
  "aria-describedby"?: string;
  /** The field's name for a screen reader when no visible label points at it. */
  "aria-label"?: string;
  /**
   * Passing this turns local filtering off: the list becomes whatever the
   * server answered for the query rather than a subset of what was loaded.
   * For the fifty thousand neighbourhoods that are never all sent.
   */
  onSearchChange?: (query: string) => void;
  loading?: boolean;
  /** Remote mode only — below this length the server is not asked at all. */
  minSearchLength?: number;
  emptyLabel?: string;
}

/**
 * Where the open list sits: under the field, or above it when the screen ends
 * first. Fixed to the viewport rather than absolute inside the field, so a
 * table with its own scroll, a dialog with its own overflow or a card that
 * clips does not cut the list off halfway down — the place most pickers in
 * this product live.
 */
interface Placement {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
}

function placeUnder(anchor: HTMLElement): Placement {
  const rect = anchor.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const flip = below < Math.min(LIST_MAX_HEIGHT, 160) && above > below;
  return flip
    ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, maxHeight: Math.min(LIST_MAX_HEIGHT, above) }
    : { top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: Math.min(LIST_MAX_HEIGHT, Math.max(below, 120)) };
}

/**
 * One picker for every select in the application.
 *
 * The control is an input rather than a button on purpose. These forms submit
 * natively and lean on the browser for `required`; a hidden input is barred
 * from constraint validation and a div cannot be validated at all, so a picker
 * built either way would let a required field submit empty and no screen here
 * would notice. The visible input is a real, focusable, validatable control,
 * and the hidden input beside it carries the value.
 *
 * Search is not conditional on the list being long. A five-value enum filters
 * too — one behaviour is easier to trust than a threshold that silently
 * decides whether typing will do anything. And search is Turkish-aware: a name
 * typed without its Turkish letters still finds itself (see lib/search-text).
 *
 * The semantics are the ARIA combobox pattern: the input owns a listbox, the
 * highlighted row is announced through `aria-activedescendant`, the arrow keys
 * move, Enter chooses, Escape closes, and focus never leaves the input — so a
 * screen reader hears one field, not a field and then a menu somewhere else.
 * On a phone each row is a full-size target, not a native popup's thin line.
 */
export function SearchableSelect({
  options,
  id,
  name,
  value,
  defaultValue,
  onChange,
  placeholder,
  selectedLabel,
  required,
  disabled,
  invalid,
  clearable,
  size = "md",
  className,
  "aria-describedby": describedBy,
  "aria-label": ariaLabel,
  onSearchChange,
  loading,
  minSearchLength = 0,
  emptyLabel,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const remote = onSearchChange !== undefined;

  /**
   * The typed term reaches the parent after the typing stops, not per keystroke.
   *
   * Every other search box in the product waits 300 ms — `ListPage`, the
   * elevator list, the label picker. This one did not, so a seven-character
   * neighbourhood was seven requests — measured — none of them cancelled, and
   * the list the user acted on was whichever answer came back last rather than
   * whichever question was asked last.
   *
   * Only the request is delayed. What is on screen is never behind what was
   * typed.
   */
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingSearch = React.useCallback(() => {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }, []);

  const searchLater = React.useCallback(
    (term: string) => {
      cancelPendingSearch();
      searchTimer.current = setTimeout(() => {
        searchTimer.current = null;
        onSearchChange?.(term);
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancelPendingSearch, onSearchChange],
  );

  // A pending request for a field that has gone would arrive as a state update
  // on something unmounted.
  React.useEffect(() => cancelPendingSearch, [cancelPendingSearch]);

  const [ownValue, setOwnValue] = React.useState(defaultValue ?? "");
  const selected = value !== undefined ? value : ownValue;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [placement, setPlacement] = React.useState<Placement | null>(null);

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  const chosen = options.find((option) => option.value === selected);
  const label = chosen?.label ?? (selected ? (selectedLabel ?? "") : "");

  const matches = React.useMemo(() => {
    if (remote) return options;
    return options.filter((option) => matchesSearch(query, option.label, option.hint));
  }, [options, query, remote]);

  const short = remote && query.trim().length < minSearchLength;

  /**
   * The visible input can hold a half-typed query, so its own emptiness proves
   * nothing about whether a choice was made. Validity is set from the
   * selection instead — otherwise typing three letters and walking away would
   * pass a required field with no value behind it.
   */
  React.useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected ? t("common.selectRequired") : "");
  }, [required, selected, t]);

  React.useEffect(() => {
    setActive(0);
  }, [query, options]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Kept beside the field while it is open: a scroll anywhere — the page, a
  // table, a dialog — or a resize moves the field, and the list goes with it.
  React.useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const anchor = wrapperRef.current;
    const update = () => setPlacement(placeUnder(anchor));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    // The parent holds the query in remote mode; leaving it set would keep a
    // stale result list warm for the next time the field is opened. Immediate,
    // and cancelling whatever was queued: closing the field is a decision, not
    // a keystroke, and a debounced clear would be overtaken by the search it
    // was meant to discard.
    cancelPendingSearch();
    if (remote) onSearchChange?.("");
  }

  function commit(next: string) {
    if (value === undefined) setOwnValue(next);
    onChange?.(next);
    setOpen(false);
    setQuery("");
    cancelPendingSearch();
    if (remote) onSearchChange?.("");
  }

  function choose(option: SearchableOption) {
    commit(option.value);
    inputRef.current?.focus();
  }

  function clear() {
    commit("");
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + matches.length) % matches.length);
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!open || matches.length === 0) return;
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : matches.length - 1);
      return;
    }

    if (event.key === "Enter") {
      // An open list swallows Enter whether or not it has a row to give: the
      // key was aimed at the picker, not at submitting the form behind it.
      if (!open) return;
      event.preventDefault();
      const option = matches[active];
      if (option) choose(option);
      return;
    }

    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      // Stopped here: an Escape meant for the list must not also close the
      // dialog the field sits in.
      event.stopPropagation();
      close();
      return;
    }

    if (event.key === "Tab" && open) close();
  }

  const showClear = clearable && !disabled && Boolean(selected) && !open;

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      {/* Disabled with the field, so a locked value is not submitted. */}
      {name && <input type="hidden" name={name} value={selected} disabled={disabled} />}

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={open ? query : label}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            if (remote) searchLater(next);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            if (open) close();
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full rounded-md border border-input bg-card pl-3 text-body text-foreground",
            showClear ? "pr-16" : "pr-9",
            "placeholder:text-subtle focus-ring transition-colors hover:border-border-strong",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
            size === "sm"
              ? "h-control-sm pointer-coarse:h-control-md"
              : "h-control-md pointer-coarse:h-control-lg",
            invalid && "border-[1.5px] border-destructive hover:border-destructive",
          )}
        />
        {showClear && (
          <button
            type="button"
            aria-label={t("common.clearSelection")}
            // Mouse down rather than click, and kept from taking focus: the
            // field must not open its list on the way to being emptied.
            onMouseDown={(event) => event.preventDefault()}
            onClick={clear}
            className="hit-40 absolute right-8 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-subtle hover:bg-muted hover:text-foreground focus-ring"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
      </div>

      {open && (
        <div
          // Keeps focus on the input while the list is used, so opening a row
          // never reads as leaving the field.
          onMouseDown={(event) => event.preventDefault()}
          style={
            placement
              ? {
                  position: "fixed",
                  top: placement.top,
                  bottom: placement.bottom,
                  left: placement.left,
                  width: placement.width,
                }
              : undefined
          }
          className={cn(
            "z-50 min-w-48 overflow-hidden rounded-md border border-border-subtle bg-card shadow-lg",
            !placement && "absolute mt-1 w-full",
          )}
        >
          {short ? (
            <p className="px-3 py-2 text-help text-muted-foreground">
              {t("common.searchMinChars", { count: minSearchLength })}
            </p>
          ) : loading ? (
            <p className="px-3 py-2 text-help text-muted-foreground">{t("common.loading")}</p>
          ) : matches.length === 0 ? (
            <p className="px-3 py-2 text-help text-muted-foreground">
              {emptyLabel ?? t("common.noMatch")}
            </p>
          ) : (
            <ul
              id={listId}
              role="listbox"
              ref={listRef}
              aria-label={ariaLabel}
              style={{ maxHeight: placement?.maxHeight ?? LIST_MAX_HEIGHT }}
              className="overflow-y-auto py-1"
            >
              {matches.map((option, index) => (
                <li
                  key={option.value || "__none"}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === selected}
                  data-active={index === active}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex min-h-control-sm cursor-pointer flex-col items-start justify-center px-3 py-2",
                    // A finger, possibly gloved, is the pointer on a phone.
                    "pointer-coarse:min-h-control-lg",
                    index === active && "bg-muted",
                    option.value === selected && "font-medium",
                  )}
                >
                  <span className="text-body">{option.label}</span>
                  {option.hint && (
                    <span className="text-help text-muted-foreground">{option.hint}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The options of an enum, labelled through the catalogue.
 *
 * Most selects in the product are an API enum shown in Turkish; this is the
 * one way to build their options, so every enum picker labels and searches
 * the same way.
 */
export function enumOptions(
  values: readonly string[],
  label: (value: string) => string,
): SearchableOption[] {
  return values.map((value) => ({ value, label: label(value) }));
}
