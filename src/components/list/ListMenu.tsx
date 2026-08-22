import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A panel hung off a control in the list header.
 *
 * Not `DropdownMenu`: that one is a menu of actions and closes on every
 * selection, which is right for "sign out" and wrong for a column list where
 * the whole point is to tick four boxes in a row. This one leaves closing to
 * the option — the filters close on choice, the columns stay open — and its
 * trigger is a form control rather than an avatar, so it carries the same
 * border and height as the search box beside it.
 *
 * The two behaviours that make it a menu rather than a div are Escape putting
 * focus back on the trigger, and a press outside closing it in the same gesture
 * that reaches whatever was pressed.
 */

interface ListMenuProps {
  label: string;
  /** Shown when nothing is chosen. */
  children: React.ReactNode;
  /** The chosen value, rendered next to the label. */
  value?: string;
  icon?: React.ReactNode;
  active?: boolean;
  className?: string;
  align?: "start" | "end";
  panel: (close: () => void) => React.ReactNode;
}

export function ListMenu({
  label,
  children,
  value,
  icon,
  active,
  className,
  align = "start",
  panel,
}: ListMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Pointerdown rather than click: pressing another control should close this
    // and reach that control in one gesture, not cost two presses.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-control-sm items-center gap-1.5 rounded-md border px-3 text-body transition-colors focus-ring pointer-coarse:h-control-md",
          active
            ? "border-primary bg-primary-soft text-primary"
            : "border-input bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
        )}
      >
        {icon}
        {children}
        {value && <span className="max-w-40 truncate font-medium">{`: ${value}`}</span>}
        <ChevronDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-full z-50 mt-1 flex max-h-96 min-w-56 flex-col overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {panel(() => {
            setOpen(false);
            triggerRef.current?.focus();
          })}
        </div>
      )}
    </div>
  );
}

/** Not an action but a state, so it carries its own checked mark and keeps the panel open unless the caller closes it. */
export function ListMenuOption({
  checked,
  role = "menuitemcheckbox",
  disabled,
  onSelect,
  trailing,
  children,
}: {
  checked: boolean;
  role?: "menuitemcheckbox" | "menuitemradio";
  disabled?: boolean;
  onSelect: () => void;
  /** A badge or a second control, kept out of the option's own hit area. */
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // `role="none"` because a menu may only hold menu items; the wrapper exists
    // to keep the pin button out of the option's own hit area.
    <div role="none" className="flex items-center gap-1 pr-2">
      <button
        type="button"
        role={role}
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "flex h-control-sm flex-1 items-center gap-2 px-3 text-left text-body transition-colors focus-ring pointer-coarse:h-control-md",
          disabled
            ? "cursor-not-allowed text-subtle"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          checked && !disabled && "text-foreground",
        )}
      >
        <Check
          className={cn("size-4 shrink-0 text-primary", checked ? "opacity-100" : "opacity-0")}
          aria-hidden="true"
        />
        <span className="flex-1 truncate">{children}</span>
      </button>
      {trailing}
    </div>
  );
}

export function ListMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div role="none" className="px-3 pb-1 pt-2 text-colhead uppercase text-muted-foreground">
      {children}
    </div>
  );
}
