import * as React from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addDays,
  addMonths,
  endOfMonth,
  fromDisplay,
  isSameMonth,
  longDateLabel,
  maskTyping,
  monthGrid,
  monthYearLabel,
  startOfMonth,
  toDisplay,
  todayIso,
  weekdayLabels,
} from "@/lib/date";

export interface DatePickerProps {
  id?: string;
  /**
   * Written to a hidden input, so a form that reads this field out of FormData
   * keeps reading the same ISO string it read from `<input type="date">`. Every
   * form in this product submits natively; none of them had to change.
   */
  name?: string;
  /** Controlled use. ISO `YYYY-MM-DD`, never the displayed string. */
  value?: string;
  /** Uncontrolled use. ISO, as it arrives from the API. */
  defaultValue?: string | null;
  /** Fired with an ISO date, or with "" when the field is emptied. */
  onChange?: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-describedby"?: string;
  /**
   * Days outside this range are drawn as unavailable and cannot be clicked.
   *
   * A hint about a rule, not the rule. The server decides whether a contract
   * may end before it starts, and it answers with an error against the field;
   * greying the days out saves a round trip for the common case without giving
   * the browser a second opinion that has to be kept in step with the first.
   * A date typed into the box is submitted whatever these say.
   */
  min?: string;
  max?: string;
}

/**
 * One date control for the whole product, typed into or picked from.
 *
 * Both ways in are first class. Not "type, and there is also a calendar" and
 * not "pick, and you may type if you insist" — a scheduler entering a year of
 * inspection dates from a list wants the keyboard and nothing else, and a
 * technician in a machine room with gloves on wants a grid of large targets and
 * nothing else. Forcing either one on the other is the whole reason this
 * component exists instead of `<input type="date">`, which additionally draws
 * itself differently in every browser and asks for the date in whatever format
 * the operating system's locale prefers — `mm/dd/yyyy` on a machine set to
 * English, in an application that is Turkish everywhere else.
 *
 * It is an input rather than a button for the same reason the select here is:
 * the surrounding form leans on the browser for `required`, and neither a
 * hidden input nor a div can be constraint-validated. The visible input is a
 * real, focusable, validatable control; the hidden input beside it carries the
 * ISO value.
 *
 * Focus never leaves the text box. The calendar is driven from it through
 * `aria-activedescendant`, exactly as the searchable select drives its list,
 * because moving focus into a grid the moment it opens is what makes a picker
 * hostile to typing.
 */
export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  invalid,
  className,
  "aria-describedby": describedBy,
  min,
  max,
}: DatePickerProps) {
  const { t } = useTranslation();

  const generatedId = React.useId();
  const inputId = id ?? `${generatedId}-input`;
  const gridId = `${generatedId}-grid`;

  const [ownValue, setOwnValue] = React.useState(defaultValue ?? "");
  const selected = value ?? ownValue;

  const [text, setText] = React.useState(() => toDisplay(value ?? defaultValue));
  const [open, setOpen] = React.useState(false);

  /** The day the calendar highlights, and the month it is therefore showing. */
  const [cursor, setCursor] = React.useState(() => selected || todayIso());

  /**
   * Whether the arrow keys belong to the calendar yet.
   *
   * Left and Right are the caret's until the calendar is actually being used,
   * because someone who has typed `05.0` and wants to fix the `5` presses Left
   * and must get the caret. Up and Down do nothing in a single-line input, so
   * they are always the calendar's — and pressing one is what hands it the rest
   * of the arrows. Typing hands them back.
   */
  const [roving, setRoving] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const caretRef = React.useRef<number | null>(null);

  const today = todayIso();
  const weekdays = React.useMemo(() => weekdayLabels(), []);
  const weeks = React.useMemo(() => monthGrid(cursor), [cursor]);

  const unavailable = React.useCallback(
    (iso: string) => Boolean((min && iso < min) || (max && iso > max)),
    [min, max],
  );

  /**
   * A value arriving from outside — a record loading, a parent resetting the
   * form — replaces what is in the box, unless the box already says the same
   * date. Without that guard a re-render would rewrite `5.3.2026` as
   * `05.03.2026` between two keystrokes, which moves the caret and is the exact
   * behaviour this component was written to avoid.
   */
  React.useEffect(() => {
    if (value === undefined) return;
    setText((current) => ((fromDisplay(current) ?? "") === value ? current : toDisplay(value)));
  }, [value]);

  React.useEffect(() => {
    if (selected) setCursor(selected);
  }, [selected]);

  /**
   * The caret, put back after React has re-rendered the input.
   *
   * The handler sets it on the DOM node directly so it survives the keystroke;
   * this puts it back after any render the parent causes in between.
   */
  React.useLayoutEffect(() => {
    const caret = caretRef.current;
    if (caret === null) return;
    caretRef.current = null;
    inputRef.current?.setSelectionRange(caret, caret);
  });

  /**
   * Validity is set from the text and the value together.
   *
   * `required` alone would pass a box holding `05.03.20` — non-empty, and no
   * date. Both failures are about the field being unreadable rather than about
   * what the date means; the server owns everything else.
   */
  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const typed = text.trim();
    if (typed !== "" && fromDisplay(typed) === null) {
      input.setCustomValidity(t("datePicker.invalidFormat"));
    } else if (required && !selected) {
      input.setCustomValidity(t("datePicker.required"));
    } else {
      input.setCustomValidity("");
    }
  }, [text, required, selected, t]);

  React.useEffect(() => {
    if (!open) return;

    // Pointerdown rather than click, so pressing another control closes the
    // calendar and reaches that control in one gesture instead of two.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function commit(iso: string) {
    if (value === undefined) setOwnValue(iso);
    onChange?.(iso);
  }

  function openCalendar() {
    if (disabled) return;
    setCursor(selected || todayIso());
    setOpen(true);
    inputRef.current?.focus();
  }

  function closeCalendar() {
    setOpen(false);
    setRoving(false);
    inputRef.current?.focus();
  }

  function choose(iso: string) {
    if (unavailable(iso)) return;
    setText(toDisplay(iso));
    commit(iso);
    setOpen(false);
    setRoving(false);
    inputRef.current?.focus();
  }

  function clear() {
    setText("");
    commit("");
    inputRef.current?.focus();
  }

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const native = event.nativeEvent as InputEvent;
    const deleting =
      typeof native.inputType === "string"
        ? native.inputType.startsWith("delete")
        : input.value.length < text.length;

    const masked = maskTyping(input.value, input.selectionStart ?? input.value.length, deleting);

    // Written to the node before the state lands, because a keystroke that the
    // mask discards produces no re-render at all — and the character would then
    // stay in the box that React thinks it has already emptied.
    input.value = masked.text;
    input.setSelectionRange(masked.caret, masked.caret);
    caretRef.current = masked.caret;

    setText(masked.text);
    setRoving(false);

    const iso = fromDisplay(masked.text);
    // A half-typed date has no value. The field is invalid while it is
    // half-typed, so nothing can be submitted in the meantime; leaving the old
    // date in the hidden input would be the worse answer, because the box and
    // the value would disagree about what the form is about to send.
    commit(iso ?? "");
    if (iso) setCursor(iso);
    if (!open) setOpen(true);
  }

  /**
   * Whatever was typed, tidied into `05.03.2026` once the user has moved on.
   *
   * Only on the way out. Rewriting `5.3.2026` as `05.03.2026` between two
   * keystrokes would insert two characters in front of the caret, which is the
   * behaviour this component exists to avoid.
   *
   * Everything inside the control keeps focus in the box — the calendar and the
   * two adornments all refuse the mousedown that would take it — so a blur is
   * always the field being left, and a field being left has no calendar.
   */
  function handleBlur() {
    const iso = fromDisplay(text);
    if (iso) setText(toDisplay(iso));
    setOpen(false);
    setRoving(false);
  }

  function moveCursor(next: string) {
    setCursor(next);
    setRoving(true);
    if (!open) setOpen(true);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      closeCalendar();
      return;
    }

    if (event.key === "Enter") {
      // An open calendar swallows Enter whether or not it has a day to give:
      // the key was aimed at the picker, not at submitting the form behind it.
      if (!open) return;
      event.preventDefault();
      if (roving || !text.trim()) choose(cursor);
      else closeCalendar();
      return;
    }

    if (event.key === "Tab") {
      if (open) setOpen(false);
      return;
    }

    if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      openCalendar();
      return;
    }

    if (event.altKey && event.key === "ArrowUp") {
      if (!open) return;
      event.preventDefault();
      closeCalendar();
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openCalendar();
        setRoving(true);
        return;
      }
      moveCursor(addDays(cursor, event.key === "ArrowDown" ? 7 : -7));
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      // Only once the calendar has been handed the arrows. Until then this is
      // a text box and Left means "back one character".
      if (!open || !roving) return;
      event.preventDefault();
      moveCursor(addDays(cursor, event.key === "ArrowRight" ? 1 : -1));
      return;
    }

    if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      const step = event.key === "PageDown" ? 1 : -1;
      moveCursor(addMonths(cursor, event.shiftKey ? step * 12 : step));
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!open || !roving) return;
      event.preventDefault();
      moveCursor(event.key === "Home" ? startOfMonth(cursor) : endOfMonth(cursor));
    }
  }

  const dayId = (iso: string) => `${gridId}-${iso}`;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name && <input type="hidden" name={name} value={selected} />}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="grid"
          aria-controls={gridId}
          aria-activedescendant={open ? dayId(cursor) : undefined}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          disabled={disabled}
          placeholder={t("datePicker.placeholder")}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onMouseDown={() => {
            if (!open) openCalendar();
          }}
          className={cn(
            "h-control-md w-full rounded-md border border-input bg-card pl-3 text-body text-foreground tnum",
            "placeholder:text-subtle focus-ring transition-colors hover:border-border-strong",
            "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
            "pointer-coarse:h-control-lg",
            selected || text ? "pr-19" : "pr-10",
            invalid && "border-[1.5px] border-destructive hover:border-destructive",
          )}
        />

        {/* Both sit outside the tab order on purpose: the combobox already
            announces that it opens a calendar, and Alt+Down opens it, so a
            keyboard user gaining two extra stops per date field would be paying
            for an affordance they do not need. They are pointer targets. */}
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center"
        >
          {(selected || text) && !disabled && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("datePicker.clear")}
              onClick={clear}
              className="hit-40 flex size-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-10"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={t("datePicker.open")}
            onClick={() => (open ? closeCalendar() : openCalendar())}
            className="hit-40 flex size-8 items-center justify-center rounded-md text-subtle transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed pointer-coarse:size-10"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {open && (
        // Keeps focus in the text box while the calendar is used, so picking a
        // day never reads as leaving the field — and never costs the typist
        // their caret.
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-30 mt-1 w-max rounded-lg border border-border bg-card p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("datePicker.previousMonth")}
              onClick={() => setCursor(addMonths(cursor, -1))}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-11"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>

            {/* Announced on change, because paging with PageUp/PageDown moves a
                whole month under a cursor that is still one cell. */}
            <div aria-live="polite" className="text-label text-foreground">
              {monthYearLabel(cursor)}
            </div>

            <button
              type="button"
              tabIndex={-1}
              aria-label={t("datePicker.nextMonth")}
              onClick={() => setCursor(addMonths(cursor, 1))}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-11"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <table
            role="grid"
            id={gridId}
            aria-label={t("datePicker.calendar")}
            className="border-separate border-spacing-0.5"
          >
            <thead>
              <tr>
                {weekdays.map((weekday) => (
                  <th
                    key={weekday.long}
                    scope="col"
                    abbr={weekday.long}
                    className="pb-1 text-colhead font-normal uppercase text-subtle"
                  >
                    {weekday.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0]}>
                  {week.map((iso) => {
                    const isSelected = iso === selected;
                    const isToday = iso === today;
                    const outside = !isSameMonth(iso, cursor);
                    const blocked = unavailable(iso);

                    return (
                      <td key={iso} role="gridcell" aria-selected={isSelected} className="p-0">
                        <button
                          type="button"
                          id={dayId(iso)}
                          tabIndex={-1}
                          aria-current={isToday ? "date" : undefined}
                          aria-disabled={blocked || undefined}
                          aria-label={
                            blocked
                              ? t("datePicker.unavailableDay", { date: longDateLabel(iso) })
                              : longDateLabel(iso)
                          }
                          onClick={() => choose(iso)}
                          className={cn(
                            "relative flex size-9 items-center justify-center rounded-md text-body tnum transition-colors",
                            // A dot under today, a fill under the selected day.
                            // Two different marks rather than two shades of one,
                            // so the day the user is looking for is never the
                            // day the calendar merely opened on.
                            "after:absolute after:bottom-1 after:size-1 after:rounded-full after:content-['']",
                            "pointer-coarse:size-11",
                            isToday ? "font-semibold" : "after:hidden",
                            outside ? "text-subtle" : "text-foreground",
                            blocked && "cursor-not-allowed opacity-40",
                            !blocked && !isSelected && "hover:bg-muted",
                            isSelected
                              ? "bg-primary text-primary-foreground after:bg-primary-foreground hover:bg-primary-hover"
                              : "after:bg-primary",
                            open && iso === cursor && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                          )}
                        >
                          {Number(iso.slice(8, 10))}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            tabIndex={-1}
            onClick={() => choose(today)}
            disabled={unavailable(today)}
            className="mt-2 h-control-sm w-full rounded-md border border-border text-body text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-control-md"
          >
            {t("datePicker.today")}
          </button>
        </div>
      )}
    </div>
  );
}
