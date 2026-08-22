import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A menu hung off a trigger.
 *
 * Written rather than installed. The two behaviours that make a menu a menu —
 * Escape closing it with focus put back where it came from, and the arrow keys
 * moving between items — are the forty lines below, and a dependency for them
 * arrives with a positioning engine, a portal and a focus trap that nothing in
 * this product needs.
 *
 * Items are `role="menuitem"` and are found by that attribute rather than by a
 * ref list, so an item added inside a wrapper is still reachable from the
 * keyboard.
 */

interface MenuContextValue {
  close: (returnFocus?: boolean) => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function itemsIn(panel: HTMLElement | null): HTMLElement[] {
  return panel ? [...panel.querySelectorAll<HTMLElement>('[role="menuitem"]')] : [];
}

export interface DropdownMenuProps {
  /** What the trigger shows. The button around it, and its aria, are supplied here. */
  trigger: React.ReactNode;
  /**
   * The trigger's accessible name. Needed rather than inferred: below `sm` the
   * trigger is an initials circle, which reads as two letters.
   */
  label: string;
  align?: "start" | "end";
  className?: string;
  children: React.ReactNode;
}

export function DropdownMenu({
  trigger,
  label,
  align = "end",
  className,
  children,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    // Pointerdown rather than click: pressing another control should close the
    // menu and reach that control in the same gesture, not cost two presses.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    // The first item takes focus so the keyboard has somewhere to start. The
    // ring is focus-visible only, so this is invisible to a mouse user.
    if (open) itemsIn(panelRef.current)[0]?.focus();
  }, [open]);

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();

    const all = itemsIn(panelRef.current);
    if (all.length === 0) return;
    const from = all.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    // Wraps, and `from` of -1 with ArrowUp lands on the last item, which is
    // what someone pressing up on a freshly opened menu is asking for.
    all[(from + step + all.length) % all.length].focus();
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-md p-1 transition-colors hover:bg-muted focus-ring"
      >
        {trigger}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          className={cn(
            "absolute top-full z-50 mt-1 flex min-w-56 flex-col rounded-lg border border-border bg-card py-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <MenuContext.Provider value={{ close }}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

/** Who or what the menu belongs to. Not focusable: it is not an action. */
export function DropdownMenuHeader({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2">{children}</div>;
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border-subtle" />;
}

export interface DropdownMenuItemProps {
  icon?: LucideIcon;
  /** Renders the item as a link, so it can be opened in a new tab. */
  to?: string;
  onSelect?: () => void;
  /** Ends a session, deletes a record — anything the user cannot undo by going back. */
  destructive?: boolean;
  children: React.ReactNode;
}

export function DropdownMenuItem({
  icon: Icon,
  to,
  onSelect,
  destructive,
  children,
}: DropdownMenuItemProps) {
  const menu = useContext(MenuContext);

  const className = cn(
    "flex h-control-sm items-center gap-2.5 px-3 text-body transition-colors focus-ring",
    "pointer-coarse:h-control-md",
    destructive
      ? "text-destructive hover:bg-destructive-bg"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

  const body = (
    <>
      {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
      {children}
    </>
  );

  // Focus is not returned to the trigger on selection: both paths lead
  // somewhere else, and restoring focus to a trigger that has since unmounted
  // does nothing useful.
  if (to) {
    return (
      <Link role="menuitem" to={to} className={className} onClick={() => menu?.close(false)}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      className={cn(className, "text-left")}
      onClick={() => {
        menu?.close(false);
        onSelect?.();
      }}
    >
      {body}
    </button>
  );
}
