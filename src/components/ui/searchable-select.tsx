import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The same interval every other search box in the product uses. Kept as its own
 * constant rather than imported from `ListPage`, which would make a list layout
 * component a dependency of a form control.
 */
const SEARCH_DEBOUNCE_MS = 300;

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
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-describedby"?: string;
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
 * Turkish casing. The default locale folds the dotted capital I onto the
 * dotless lowercase, which is the wrong letter here: a search would miss every
 * name that starts with one and match names that start with the other.
 */
const fold = (text: string) => text.toLocaleLowerCase("tr");

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
 * decides whether typing will do anything.
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
  className,
  "aria-describedby": describedBy,
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
   * whichever question was asked last. Same interval as the others
   * deliberately: a field that behaves differently from its neighbours reads as
   * a different kind of field.
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

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();

  const chosen = options.find((option) => option.value === selected);
  const label = chosen?.label ?? (selected ? (selectedLabel ?? "") : "");

  const matches = React.useMemo(() => {
    if (remote) return options;
    const needle = fold(query.trim());
    if (!needle) return options;
    return options.filter(
      (option) =>
        fold(option.label).includes(needle) ||
        (option.hint ? fold(option.hint).includes(needle) : false),
    );
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

  function choose(option: SearchableOption) {
    if (value === undefined) setOwnValue(option.value);
    onChange?.(option.value);
    setOpen(false);
    setQuery("");
    cancelPendingSearch();
    if (remote) onSearchChange?.("");
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
      close();
      return;
    }

    if (event.key === "Tab" && open) close();
  }

  return (
    <div className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={selected} />}

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
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
          onBlur={() => {
            if (open) close();
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            "h-control-md w-full rounded-md border border-input bg-card pl-3 pr-9 text-body text-foreground",
            "placeholder:text-subtle focus-ring transition-colors hover:border-border-strong",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
            "pointer-coarse:h-control-lg",
            invalid && "border-[1.5px] border-destructive hover:border-destructive",
          )}
        />
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
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border-subtle bg-card shadow-md"
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
            <ul id={listId} role="listbox" ref={listRef} className="max-h-56 overflow-y-auto py-1">
              {matches.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === selected}
                  data-active={index === active}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex cursor-pointer flex-col items-start px-3 py-2",
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
