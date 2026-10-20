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

/** The `data` keys a kind cannot be worded without. Mirrors `NotificationKind`'s docstring. */
const REQUIRED: Record<string, readonly string[]> = {
  contract_renewal_due: ["contract_number", "end_date"],
  contract_expired: ["contract_number", "end_date"],
  contract_auto_renewed: ["contract_number", "end_date", "successor_contract_number"],
  contract_auto_renewal_blocked: ["contract_number", "end_date", "successor_contract_number"],
  maintenance_overdue: ["elevator_name", "next_maintenance_date"],
  visit_assigned: ["period", "count"],
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
  notification: Pick<AppNotification, "subject_type" | "subject_id">,
):
  | { to: "/contracts/$id" | "/elevators/$id"; params: { id: string } }
  | { to: "/today"; params?: undefined }
  | null {
  if (notification.subject_type === "plan") return { to: "/today" };
  if (!notification.subject_id) return null;
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
