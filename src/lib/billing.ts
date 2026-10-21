/**
 * The decisions the billing screens make, as plain functions (M7).
 *
 * Which actions a draft offers to whom, which drafts go first, and the totals
 * a list shows. The server enforces every transition — `INVOICE_TRANSITION_
 * NOT_ALLOWED` for the wrong state, `INVOICE_LINES_NEED_PRICE` for an issue
 * with a line still unpriced — so these only decide what is worth offering,
 * and say why when something is not.
 */
import type { components } from "@/api/generated";
import { sumMoney } from "@/lib/money";

type InvoiceStatus = components["schemas"]["InvoiceStatus"];

/** Who sees billing at all: the money roles, by the server's matrix. */
export function canUseBilling(role: string | null): boolean {
  return role === "owner" || role === "admin" || role === "accountant";
}

export type DraftAction = "editLines" | "issue" | "markPaid" | "cancel" | "pdf";

/**
 * What can be done to a draft in its state.
 *
 * A draft is the only state that can be changed: lines priced, added and
 * removed, notes edited, and then issued once the invoice exists in the
 * e-invoice system. An issued draft is read-only, and is either paid or
 * cancelled. Paid and cancelled are history. The PDF is always available —
 * it is how a draft is checked before it is issued, and kept after.
 */
export function draftActions(status: InvoiceStatus, role: string | null): DraftAction[] {
  if (!canUseBilling(role)) return [];
  const actions: DraftAction[] = ["pdf"];
  if (status === "draft") actions.push("editLines", "issue", "cancel");
  if (status === "issued") actions.push("markPaid", "cancel");
  return actions;
}

/**
 * Why "issue" cannot go yet, or null when it can. Lines without a price are
 * the one thing the client can see in advance; the server refuses the rest
 * (a duplicate invoice number) as it explains it.
 */
export function issueBlocker(lines: ReadonlyArray<{ needs_price: boolean }>): { unpriced: number } | null {
  const unpriced = lines.filter((line) => line.needs_price).length;
  return unpriced > 0 ? { unpriced } : null;
}

/**
 * The list's order: drafts still waiting for a price first — they are the
 * accountant's work — then everything else in the order the server sent it.
 * A stable sort, so "the order the server sent it" survives.
 */
export function needsPriceFirst<T extends { needs_price: boolean }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => Number(b.needs_price) - Number(a.needs_price));
}

export interface StatusTotal {
  status: InvoiceStatus;
  count: number;
  total: string;
}

/**
 * Sum of totals per status, over the rows given — exact, in kurus.
 *
 * The API has no aggregate, so this sums what the screen holds: the current
 * page. The screen says so ("bu sayfadaki"), because a total that looks like
 * the whole period and is not is worse than no total.
 */
export function totalsByStatus(
  rows: ReadonlyArray<{ status: InvoiceStatus; total: string }>,
): StatusTotal[] {
  const order: InvoiceStatus[] = ["draft", "issued", "paid", "cancelled"];
  return order
    .map((status) => {
      const mine = rows.filter((row) => row.status === status);
      return { status, count: mine.length, total: sumMoney(mine.map((row) => row.total)) };
    })
    .filter((entry) => entry.count > 0);
}

/** "2026-10" for the filter, from a period start the API sent. */
export function periodOfDraft(periodStart: string): string {
  return periodStart.slice(0, 7);
}
