import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The behaviour that makes an overlay a dialog.
 *
 * Written rather than installed, for the reason `dropdown-menu.tsx` gives: this
 * is sixty lines, and a dependency for it arrives with a positioning engine and
 * a portal nothing in this product needs. Escape closing the thing with focus
 * put back where it came from is deliberately the same code as the menus'.
 *
 * What a dialog adds over a menu is containment. `aria-modal="true"` tells
 * assistive technology that everything outside the element is unavailable, and
 * for as long as nothing enforced it, it was a claim the markup did not honour:
 * the page behind stayed in the tab order and in the accessibility tree, so a
 * screen reader could read and operate a page its user could not reach.
 *
 * Containment is done with `inert` rather than `aria-hidden` or a focus trap,
 * because it is the only one of the three that does both jobs. `aria-hidden`
 * removes a subtree from the accessibility tree and leaves it tabbable. A trap
 * holds the keyboard and leaves a screen reader free to browse the page behind.
 * `inert` removes the subtree from the tab order *and* from the accessibility
 * tree, which is exactly what `aria-modal` promises. It is available everywhere
 * this app already runs — the CSS it is built on needs a newer browser than
 * `inert` does.
 *
 * The Tab wrap below is therefore not the containment. It is the second line
 * for a browser that does not honour `inert`, and the reason focus cycles
 * inside the panel instead of stepping out into the browser's own chrome.
 */

/**
 * Everything the Tab key can reach.
 *
 * `[tabindex="-1"]` is excluded on purpose: it is reachable by script only,
 * which is what the panel itself is.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusablesIn(panel: HTMLElement | null): HTMLElement[] {
  return panel ? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
}

/**
 * Marks everything that is not the overlay or one of its ancestors as inert,
 * and hands back the undo.
 *
 * Walking the ancestor chain rather than moving the overlay to `<body>` with a
 * portal: the dialogs render inside the screen that owns their state, a portal
 * would have to exist before the first paint to be focusable on it, and the
 * server renderer this repo smoke-tests with refuses portals outright. Marking
 * every sibling along the path leaves only layout wrappers un-inerted, and a
 * layout wrapper holds no content of its own to read.
 *
 * A sibling that is already inert belongs to an overlay further out and is that
 * overlay's to restore, not this one's.
 */
function inertEverythingBehind(overlay: HTMLElement): () => void {
  const marked: Element[] = [];

  for (
    let node: Element | null = overlay;
    node && node !== document.body;
    node = node.parentElement
  ) {
    for (const sibling of node.parentElement?.children ?? []) {
      if (sibling !== node && !sibling.hasAttribute("inert")) {
        sibling.setAttribute("inert", "");
        marked.push(sibling);
      }
    }
  }

  return () => {
    for (const element of marked) element.removeAttribute("inert");
  };
}

export interface ModalProps {
  open: boolean;
  /** Escape, a press on the backdrop and the dialog's own cancel all route here. */
  onClose: () => void;
  /** The dialog's accessible name. */
  label: string;
  /**
   * `alertdialog` interrupts to report something the user must act on before
   * continuing — a termination, a deletion. `dialog` is everything else.
   */
  role?: "dialog" | "alertdialog";
  /** A dialog sits in the middle; a drawer comes in from the edge. */
  placement?: "center" | "inline-start";
  /** Panel classes. The width belongs to the caller; the rest does not. */
  className?: string;
  /** Overlay classes, for the breakpoints a drawer lives at. */
  overlayClassName?: string;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  label,
  role = "dialog",
  placement = "center",
  className,
  overlayClassName,
  children,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    if (!open || !overlay || !panel) return;

    // Read before anything is marked: inerting the opener's subtree blurs it,
    // and by then `activeElement` is `<body>` and the way back is lost.
    const opener = document.activeElement;
    const restore = inertEverythingBehind(overlay);

    // The panel, not the first control in it. On an alertdialog the first
    // control is often the destructive one, and a dialog that opens with Enter
    // already armed is how a contract gets terminated by someone who meant to
    // read the consequences first.
    panel.focus();

    return () => {
      restore();
      // Closing from a control inside the dialog unmounts the element holding
      // focus, which drops it to `<body>` and sends the next Tab back to the
      // top of the page. `isConnected` because the opener does not always
      // survive the action it started — a row's own button goes with the row.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // On the document rather than the panel: Escape has to work from wherever
    // focus ended up, including a control that moved it itself.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const onOverlayKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;

    const items = focusablesIn(panelRef.current);
    if (items.length === 0) {
      // Nothing to move to. Leaving Tab alone here would step straight out of
      // a dialog that has no way back in.
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    // Only the two ends are handled; in between, the browser's own order is
    // better than anything reimplemented here. Shift+Tab off the panel itself
    // wraps to the last item, which is what someone reversing out of a freshly
    // opened dialog is asking for.
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      onKeyDown={onOverlayKeyDown}
      className={cn(
        "fixed inset-0 z-50 flex",
        placement === "center" && "items-center justify-center p-4",
        overlayClassName,
      )}
    >
      {/* Not a button, which is what it used to be. Being the first tabbable
          element in the overlay meant the first Tab press after opening landed
          on an invisible screen-covering "close" — before anything in the
          dialog. A press outside is a pointer affordance and nothing else; the
          keyboard already has Escape and the dialog's own cancel. */}
      <div aria-hidden="true" className="absolute inset-0 bg-foreground/40" onClick={onClose} />

      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "relative flex flex-col overflow-y-auto bg-card shadow-lg outline-none",
          placement === "center"
            ? // The cap is the primitive's, not the caller's. It was the
              // caller's, and the one dialog written without it put its confirm
              // button below the fold of a 360x640 phone with nothing to scroll.
              "max-h-[90vh] w-full gap-4 rounded-xl border border-border p-6"
            : "h-full",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
