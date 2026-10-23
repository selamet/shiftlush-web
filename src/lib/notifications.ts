/**
 * Turning a notification into words.
 *
 * The server sends a kind and a bag of data and deliberately no prose — the
 * project rule is that sentences live with the reader, in the reader's
 * language. So this is where a `contract_expired` with a contract number and a
 * date becomes the sentence a person reads, in the bell, on the list, and (on
 * the server, from its own templates) in the e-mail. The three must say the
 * same thing: somebody who read the e-mail and then opens the app should
 * recognise the notice as the same one. The wording in messages/tr.json is
 * taken from templates/email/notification/kinds/ in shiftlush-api for that
 * reason, and should move with it.
 *
 * Pure functions of the notification and a `t`, so the unit suite reads them
 * directly against the real catalogue.
 */
import type { TFunction } from "i18next";
import type { AppNotification } from "@/api/queries";
import { monthYearLabel, toDisplay } from "@/lib/date";
import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { isPeriod } from "@/lib/plan";

/** The `data` keys a kind cannot be worded without. Mirrors `NotificationKind`'s docstring. */
const REQUIRED: Record<string, readonly string[]> = {
  contract_renewal_due: ["contract_number", "end_date"],
  contract_expired: ["contract_number", "end_date"],
  contract_auto_renewed: ["contract_number", "end_date", "successor_contract_number"],
  contract_auto_renewal_blocked: ["contract_number", "end_date", "successor_contract_number"],
  maintenance_overdue: ["elevator_name", "next_maintenance_date"],
  visit_assigned: ["period", "count"],
  invoice_drafts_ready: ["period", "count"],
  billing_vat_missing: ["contract_number", "period_start", "period_end"],
  monthly_reports_ready: ["period", "sent"],
  fault_reported: ["reference", "elevator_name", "building_name"],
  fault_emergency: ["reference", "elevator_name", "building_name"],
  fault_assigned: ["reference", "elevator_name", "building_name"],
  fault_resolved: ["reference", "elevator_name", "building_name"],
  inspection_due: ["elevator_name", "building_name", "next_inspection_date"],
  correction_deadline_near: ["elevator_name", "building_name", "correction_deadline"],
  correction_deadline_passed: ["elevator_name", "building_name", "correction_deadline"],
  inspection_red_label: ["elevator_name", "building_name", "inspected_on", "correction_deadline"],
};

export interface NotificationText {
  /** One line, the same as the e-mail's subject. */
  title: string;
  /** The full sentence, the same as the e-mail's body. */
  body: string;
  /** False when this client does not know how to word it and fell back. */
  known: boolean;
}

/** A value out of `data` as text. `data` is JSON, so anything may be in there. */
function text(data: AppNotification["data"], key: string): string {
  const value = data[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

/**
 * How the sentence names a contract: with the customer when the server knew
 * it, without when it did not — the e-mail template makes the same choice.
 */
function contractRef(data: AppNotification["data"], t: TFunction): string {
  const number = text(data, "contract_number");
  const customer = text(data, "customer_name");
  return customer
    ? t("notification.contractRefWithCustomer", { customer, number })
    : t("notification.contractRef", { number });
}

/**
 * The words for one notification.
 *
 * A kind this client has never heard of — the server may add one before the
 * client ships its wording — still renders: a plain "you have a notification"
 * with no claim about what it says, rather than a blank row or a thrown error.
 * The same happens when a known kind arrives without the data its sentence
 * needs, because a sentence with a hole in it ("the contract numbered  has
 * expired") is worse than one that admits it cannot say.
 */
export function describeNotification(notification: AppNotification, t: TFunction): NotificationText {
  const { kind, data } = notification;
  const required = REQUIRED[kind];
  if (!required || required.some((key) => !text(data, key))) {
    return { title: t("notification.unknown.title"), body: t("notification.unknown.body"), known: false };
  }

  const number = text(data, "contract_number");
  const successor = text(data, "successor_contract_number");

  switch (kind) {
    case "contract_renewal_due": {
      // `auto_renew` decides the second sentence. Anything but a real `true` is
      // read as "off": promising a renewal that will not happen is the worse
      // mistake of the two.
      const renewal =
        data.auto_renew === true
          ? t("notification.body.renewalOn")
          : t("notification.body.renewalOff");
      return {
        title: t("notification.subject.contract_renewal_due", { number }),
        body: `${t("notification.body.contract_renewal_due", {
          contract: contractRef(data, t),
          date: toDisplay(text(data, "end_date")),
        })} ${renewal}`,
        known: true,
      };
    }
    case "contract_expired":
    case "contract_auto_renewed":
    case "contract_auto_renewal_blocked":
      return {
        title: t(`notification.subject.${kind}`, { number }),
        body: t(`notification.body.${kind}`, {
          contract: contractRef(data, t),
          date: toDisplay(text(data, "end_date")),
          successor,
        }),
        known: true,
      };
    case "maintenance_overdue": {
      const elevator = text(data, "elevator_name");
      const building = text(data, "building_name");
      const date = toDisplay(text(data, "next_maintenance_date"));
      return {
        title: t("notification.subject.maintenance_overdue", { elevator }),
        body: building
          ? t("notification.body.maintenance_overdue_withBuilding", { elevator, building, date })
          : t("notification.body.maintenance_overdue", { elevator, date }),
        known: true,
      };
    }
    case "fault_reported":
    case "fault_emergency":
    case "fault_assigned":
    case "fault_resolved":
      return { ...describeFault(kind, data, t), known: true };
    case "inspection_due":
    case "correction_deadline_near":
    case "correction_deadline_passed":
    case "inspection_red_label":
      return { ...describeInspection(kind, data, t), known: true };
    case "invoice_drafts_ready": {
      const month = monthYearLabel(`${text(data, "period")}-01`) || text(data, "period");
      const count = Number(text(data, "count"));
      const unpriced = Number(text(data, "needs_price") || "0");
      if (!Number.isInteger(count)) {
        return { title: t("notification.unknown.title"), body: t("notification.unknown.body"), known: false };
      }
      return {
        title: t("notification.subject.invoice_drafts_ready", { month, count }),
        body: t(
          unpriced > 0 ? "notification.body.invoice_drafts_ready_unpriced" : "notification.body.invoice_drafts_ready",
          { month, count, unpriced },
        ),
        known: true,
      };
    }
    case "billing_vat_missing":
      return {
        title: t("notification.subject.billing_vat_missing", { number: text(data, "contract_number") }),
        body: t("notification.body.billing_vat_missing", {
          contract: contractRef(data, t),
          start: toDisplay(text(data, "period_start")),
          end: toDisplay(text(data, "period_end")),
        }),
        known: true,
      };
    case "monthly_reports_ready": {
      // Worded as the e-mail is: what was sent always, and each kind of
      // "not sent" only when there was some.
      const month = monthYearLabel(`${text(data, "period")}-01`) || text(data, "period");
      const counts = {
        sent: Number(text(data, "sent")),
        noRecipient: Number(text(data, "no_recipient") || "0"),
        notEnabled: Number(text(data, "not_enabled") || "0"),
        failed: Number(text(data, "failed") || "0"),
      };
      if (!Object.values(counts).every(Number.isInteger)) {
        return { title: t("notification.unknown.title"), body: t("notification.unknown.body"), known: false };
      }
      const parts = (Object.keys(counts) as (keyof typeof counts)[])
        .filter((key) => key === "sent" || counts[key] > 0)
        .map((key) => t(`notification.monthlyReports.${key}`, { count: counts[key] }));
      return {
        title: t("notification.subject.monthly_reports_ready", { month }),
        body: t("notification.body.monthly_reports_ready", { month, parts: parts.join(", ") }),
        known: true,
      };
    }
    case "visit_assigned": {
      // The month as the e-mail spells it — month name and year — from Intl rather
      // than a list of month names in this file.
      const month = monthYearLabel(`${text(data, "period")}-01`) || text(data, "period");
      // A number for i18next, which reserves `count` for plurals.
      const count = Number(text(data, "count"));
      if (!Number.isInteger(count)) {
        return { title: t("notification.unknown.title"), body: t("notification.unknown.body"), known: false };
      }
      return {
        title: t("notification.subject.visit_assigned", { count, month }),
        body: t("notification.body.visit_assigned", { count, month }),
        known: true,
      };
    }
    default:
      return { title: t("notification.unknown.title"), body: t("notification.unknown.body"), known: false };
  }
}

/**
 * The four inspection kinds, worded as their e-mails are. The two that are
 * always e-mailed say so in the e-mail; in the app there is no inbox to be
 * independent of, so that sentence is left out here.
 */
function describeInspection(
  kind: "inspection_due" | "correction_deadline_near" | "correction_deadline_passed" | "inspection_red_label",
  data: AppNotification["data"],
  t: TFunction,
): Omit<NotificationText, "known"> {
  const base = {
    elevator: text(data, "elevator_name"),
    building: text(data, "building_name"),
    deadline: toDisplay(text(data, "correction_deadline")),
    days: text(data, "days_left"),
    open: text(data, "open_nonconformities") || "0",
  };
  const title = t(`notification.subject.${kind}`, base);
  if (kind === "inspection_due") {
    const inspector = text(data, "inspection_body");
    return {
      title,
      body: t(inspector ? "notification.body.inspection_due_withBody" : "notification.body.inspection_due", {
        ...base,
        date: toDisplay(text(data, "next_inspection_date")),
        inspector,
      }),
    };
  }
  if (kind === "correction_deadline_near") {
    return {
      title,
      body: t(
        text(data, "label") === "red"
          ? "notification.body.correction_deadline_near_red"
          : "notification.body.correction_deadline_near_yellow",
        base,
      ),
    };
  }
  if (kind === "correction_deadline_passed") return { title, body: t("notification.body.correction_deadline_passed", base) };
  return {
    title,
    body: t("notification.body.inspection_red_label", {
      ...base,
      inspected: toDisplay(text(data, "inspected_on")),
    }),
  };
}

/**
 * The four fault kinds, worded as their e-mails are.
 *
 * The optional parts — "from the QR sticker", "the lift is not running", the
 * resident's description, who resolved it — are fragments of their own in the
 * catalogue, joined here exactly where the templates join them, so a sentence
 * with a part missing still reads as a sentence.
 */
function describeFault(
  kind: "fault_reported" | "fault_emergency" | "fault_assigned" | "fault_resolved",
  data: AppNotification["data"],
  t: TFunction,
): Omit<NotificationText, "known"> {
  const base = {
    elevator: text(data, "elevator_name"),
    building: text(data, "building_name"),
    reference: text(data, "reference"),
  };
  const priority = text(data, "priority");
  const description = text(data, "description");
  const quoted = description ? ` ${t("notification.fragment.description", { description })}` : "";
  const title = t(`notification.subject.${kind}`, base);

  if (kind === "fault_reported") {
    const body = t("notification.body.fault_reported", {
      ...base,
      via: text(data, "channel") === "public_qr" ? t("notification.fragment.viaQr") : "",
      stopped: priority === "high" ? t("notification.fragment.notRunning") : "",
    });
    return { title, body: `${body}${quoted}` };
  }
  if (kind === "fault_emergency") {
    return { title, body: `${t("notification.body.fault_emergency", base)}${quoted}` };
  }
  if (kind === "fault_assigned") {
    const severity =
      priority === "emergency"
        ? ` ${t("notification.fragment.trapped")}`
        : priority === "high"
          ? ` ${t("notification.fragment.notRunningSentence")}`
          : "";
    return { title, body: `${t("notification.body.fault_assigned", base)}${severity}` };
  }
  const technician = text(data, "technician_name");
  return {
    title,
    body: technician
      ? t("notification.body.fault_resolved_by", { ...base, technician })
      : t("notification.body.fault_resolved", base),
  };
}

/**
 * Where a notification leads: the record it is about.
 *
 * `null` for a subject this client has no screen for. The row is still shown
 * and can still be marked read; it just is not a link to nowhere.
 *
 * A `plan` subject is the recipient's own work list rather than one record —
 * the server raises `visit_assigned` with the recipient's id — so it leads to
 * their "today" screen, which is where newly assigned lifts are worked from.
 */
export function notificationTarget(
  notification: Pick<AppNotification, "subject_type" | "subject_id"> & { data?: AppNotification["data"] },
):
  | { to: "/contracts/$id" | "/elevators/$id"; params: { id: string } }
  | { to: "/faults/$id"; params: { id: string } }
  | { to: "/today" | "/billing"; params?: undefined }
  | { to: "/reports"; params?: undefined; search: { period?: string } }
  | null {
  if (notification.subject_type === "plan") return { to: "/today" };
  // The firm's reports for one month: the reports screen, narrowed to it.
  // A period that is not a month is left off rather than sent as a filter
  // the screen would drop anyway.
  if (notification.subject_type === "reports") {
    const period = notification.data ? text(notification.data, "period") : "";
    return { to: "/reports", search: isPeriod(period) ? { period } : {} };
  }
  // The firm's billing as a whole, not one draft: the drafts are listed there.
  if (notification.subject_type === "billing") return { to: "/billing" };
  if (!notification.subject_id) return null;
  if (notification.subject_type === "fault") {
    return { to: "/faults/$id", params: { id: notification.subject_id } };
  }
  if (notification.subject_type === "contract") {
    return { to: "/contracts/$id", params: { id: notification.subject_id } };
  }
  if (notification.subject_type === "elevator") {
    return { to: "/elevators/$id", params: { id: notification.subject_id } };
  }
  return null;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relative = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: "auto" });

/**
 * When it happened, the way people say it: "5 minutes ago", "yesterday".
 *
 * For a week; after that the date itself, because "23 days ago" makes the
 * reader do arithmetic to learn which day it was. The words come from Intl
 * rather than from the catalogue, so they are Turkish without this file
 * containing any — except "just now", which Intl would phrase as "0 minutes
 * ago", which nobody says. The Turkish they produce is asserted in the tests.
 */
export function relativeTime(iso: string, t: TFunction, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - now) / 1000);
  const distance = Math.abs(seconds);

  if (distance < 45) return t("notification.justNow");
  if (distance < HOUR) return relative.format(Math.round(seconds / MINUTE), "minute");
  if (distance < DAY) return relative.format(Math.round(seconds / HOUR), "hour");
  if (distance < 7 * DAY) return relative.format(Math.round(seconds / DAY), "day");
  return formatDate(iso);
}

/** The bell's badge. Past nine the exact number stops changing what anyone does. */
export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}
