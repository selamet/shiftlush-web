/**
 * The decisions the monthly customer report screens make, as plain functions.
 *
 * Who may read reports, who may send them, what a report's summary says in
 * one sentence, and what a contact's "receives the report" box may be. The
 * server enforces each of these — the role matrix, `MONTHLY_REPORT_NEEDS_EMAIL`
 * for an e-mail-less contact, `REPORT_NO_RECIPIENT` for a send with nobody
 * ticked — so these only decide what is worth offering.
 */
import type { TFunction } from "i18next";
import type { components } from "@/api/generated";
import { addMonths, todayIso } from "@/lib/date";
import { periodOf } from "@/lib/plan";

type Schemas = components["schemas"];
export type ReportDelivery = Schemas["DeliveryEnum"];

export const DELIVERY_STATES: readonly ReportDelivery[] = [
  "pending",
  "sent",
  "not_enabled",
  "no_recipient",
  "failed",
];

/** Who reads reports: the office and the accountant, by the server's matrix. Not technicians. */
export function canReadReports(role: string | null): boolean {
  return role === "owner" || role === "admin" || role === "operations" || role === "accountant";
}

/** Who sends a report and previews one: the office roles. The accountant only reads. */
export function canSendReports(role: string | null): boolean {
  return role === "owner" || role === "admin" || role === "operations";
}

/** Who turns the firm's e-mails on: the owner alone, as for every company setting. */
export function canToggleMonthlyReports(role: string | null): boolean {
  return role === "owner";
}

/**
 * "Send" for a report that has not gone out, "send again" for one that has.
 *
 * A report with no `sent_at` has never reached anybody, whatever its state —
 * the switch was off, nobody was ticked, or the mail failed — so the first
 * press is a send. Once it has gone, the button says what pressing it does.
 */
export function sendLabelKey(report: { sent_at: string | null }): "report.send" | "report.resend" {
  return report.sent_at ? "report.resend" : "report.send";
}

/** How many months a customer's panel shows before "all of them" on the reports screen. */
export const REPORT_PANEL_SIZE = 12;

/** The customer panel's request, shared with the route's prefetch so both read one key. */
export function customerReportPanelParams(customerId: string) {
  return { customer: customerId, page_size: REPORT_PANEL_SIZE };
}

/** The deliveries the office acts on: nobody to send to, or a send that failed. */
export function needsAction(delivery: string): boolean {
  return delivery === "no_recipient" || delivery === "failed";
}

interface Lead {
  key: string;
  count: number;
  minutes: number | null;
}

/** The lead out of a summary, which is JSON and may hold anything. */
function leadOf(summary: unknown): Lead | null {
  if (!summary || typeof summary !== "object") return null;
  const lead = (summary as Record<string, unknown>).lead;
  if (!lead || typeof lead !== "object") return null;
  const { key, count, minutes } = lead as Record<string, unknown>;
  if (typeof key !== "string" || typeof count !== "number" || !Number.isInteger(count)) return null;
  return { key, count, minutes: typeof minutes === "number" ? minutes : null };
}

/**
 * The report's one leading sentence, as the PDF and the e-mail word it.
 *
 * The server picks the rule and sends its key, never the sentence: the words
 * live here, the same as the template's. A summary without a lead, or with a
 * key this client does not know, yields an empty string — no sentence rather
 * than a wrong one, because "every lift was maintained" is exactly the claim
 * the report must never make by accident.
 */
export function leadSentence(summary: unknown, t: TFunction): string {
  const lead = leadOf(summary);
  if (!lead) return "";
  switch (lead.key) {
    case "correction_passed":
    case "missed":
      return t(`report.lead.${lead.key}`, { count: lead.count });
    case "emergencies":
      return lead.minutes === null
        ? t("report.lead.emergenciesNoMinutes", { count: lead.count })
        : t("report.lead.emergencies", { count: lead.count, minutes: lead.minutes });
    case "all_done":
      return t("report.lead.all_done");
    default:
      return "";
  }
}

/** Planned and completed visits, as "11 / 12" wants them; null when the summary lacks them. */
export function visitCounts(summary: unknown): { planned: number; completed: number } | null {
  if (!summary || typeof summary !== "object") return null;
  const { visits_planned: planned, visits_completed: completed } = summary as Record<string, unknown>;
  if (typeof planned !== "number" || typeof completed !== "number") return null;
  return { planned, completed };
}

/** The recipients a report went to. JSON on the record, so read defensively. */
export function recipientList(recipients: unknown): string[] {
  return Array.isArray(recipients) ? recipients.filter((one): one is string => typeof one === "string") : [];
}

/** This month, as `YYYY-MM` — what "this month's preview" renders to date. */
export function currentReportPeriod(today: string = todayIso()): string {
  return periodOf(today);
}

/**
 * The months the reports screen's menu offers: the last twelve that have
 * ended, newest first. The month under way has no report yet — the job makes
 * it on the 1st of the next — so it is not offered as though it might.
 */
export function reportPeriodOptions(today: string = todayIso()): string[] {
  const first = `${periodOf(today)}-01`;
  return Array.from({ length: 12 }, (_, index) => periodOf(addMonths(first, -1 - index)));
}

/**
 * Whether a contact may be ticked to receive the report: only with an e-mail,
 * because that is the only way the report travels.
 */
export function canReceiveReport(email: string | null | undefined): boolean {
  return Boolean(email && email.trim());
}

/**
 * The box's value after the e-mail field changed: cleared with the e-mail,
 * otherwise left as the person set it. Ticking it again is theirs to do — an
 * address typed back in does not re-subscribe anybody on its own.
 */
export function receivesAfterEmailChange(receives: boolean, email: string): boolean {
  return receives && canReceiveReport(email);
}
