/**
 * The monthly customer report: who sees what, what a report says in one
 * sentence, when a contact may receive it, and the requests behind the panel.
 *
 * The lead sentences are asserted in full against the real catalogue, because
 * they are the same sentences the PDF and the e-mail print (shiftlush-api's
 * templates/reports/monthly.html) — a rewording here that those do not share
 * should fail, and be made in all three places.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import i18n from "@/lib/i18n";
import { ApiError, __resetClient, setAccessToken } from "@/api/client";
import { errorMessage } from "@/api/errors";
import {
  customerReportDownloadUrl,
  customerReportListQuery,
  previewCustomerReport,
  sendCustomerReport,
} from "@/api/queries";
import { portalKeys, portalReportsQuery } from "@/api/portal-queries";
import {
  canReadReports,
  canReceiveReport,
  canSendReports,
  canToggleMonthlyReports,
  currentReportPeriod,
  customerReportPanelParams,
  leadSentence,
  needsAction,
  receivesAfterEmailChange,
  recipientList,
  reportPeriodOptions,
  sendLabelKey,
  visitCounts,
} from "@/lib/reports";
import { reportListSearch } from "@/screens/list-searches";
import { errorEnvelope, installFetch, jsonResponse, thrown } from "./support";

const t = i18n.t as unknown as TFunction;

function summary(lead: Record<string, unknown>) {
  return { lifts: 3, visits_planned: 12, visits_completed: 11, lead };
}

describe("who sees reports", () => {
  it("lets the office and the accountant read, and keeps technicians out", () => {
    for (const role of ["owner", "admin", "operations", "accountant"]) expect(canReadReports(role)).toBe(true);
    expect(canReadReports("technician")).toBe(false);
    expect(canReadReports(null)).toBe(false);
  });

  it("lets only the office send and preview; the accountant reads", () => {
    for (const role of ["owner", "admin", "operations"]) expect(canSendReports(role)).toBe(true);
    expect(canSendReports("accountant")).toBe(false);
    expect(canSendReports("technician")).toBe(false);
  });

  it("lets only the owner turn the firm's e-mails on", () => {
    expect(canToggleMonthlyReports("owner")).toBe(true);
    for (const role of ["admin", "operations", "accountant", "technician", null]) {
      expect(canToggleMonthlyReports(role)).toBe(false);
    }
  });
});

describe("leadSentence", () => {
  it("words each rule as the PDF does", () => {
    expect(leadSentence(summary({ key: "correction_passed", count: 2, minutes: null }), t)).toBe(
      "2 asansörde düzeltme süresi geçti.",
    );
    expect(leadSentence(summary({ key: "missed", count: 2, minutes: null }), t)).toBe(
      "2 asansörün bakımı bu ay yapılamadı.",
    );
    expect(leadSentence(summary({ key: "emergencies", count: 3, minutes: 42 }), t)).toBe(
      "Bu ay 3 acil arıza oldu; ortalama müdahale süresi 42 dakika.",
    );
    expect(leadSentence(summary({ key: "all_done", count: 0, minutes: null }), t)).toBe(
      "Tüm asansörlerin bakımı yapıldı.",
    );
  });

  it("leaves the average out when no response time was known", () => {
    expect(leadSentence(summary({ key: "emergencies", count: 1, minutes: null }), t)).toBe("Bu ay 1 acil arıza oldu.");
  });

  it("says nothing rather than claim every lift was maintained on a summary it cannot read", () => {
    expect(leadSentence(null, t)).toBe("");
    expect(leadSentence({}, t)).toBe("");
    expect(leadSentence(summary({ key: "something_new", count: 1 }), t)).toBe("");
    expect(leadSentence(summary({ key: "missed", count: "2" }), t)).toBe("");
  });
});

describe("a report's row", () => {
  it("offers send for a report that never went out, and send again for one that did", () => {
    expect(sendLabelKey({ sent_at: null })).toBe("report.send");
    expect(sendLabelKey({ sent_at: "2026-11-01T05:00:00Z" })).toBe("report.resend");
  });

  it("marks no recipient and failed as the office's work", () => {
    expect(needsAction("no_recipient")).toBe(true);
    expect(needsAction("failed")).toBe(true);
    for (const state of ["sent", "not_enabled", "pending"]) expect(needsAction(state)).toBe(false);
  });

  it("reads the visit counts and the recipients defensively", () => {
    expect(visitCounts(summary({ key: "all_done", count: 0 }))).toEqual({ planned: 12, completed: 11 });
    expect(visitCounts({ lead: {} })).toBeNull();
    expect(recipientList(["a@example.com", 3, null, "b@example.com"])).toEqual(["a@example.com", "b@example.com"]);
    expect(recipientList("a@example.com")).toEqual([]);
  });
});

describe("the reports screen's months", () => {
  it("offers the twelve months that have ended, newest first, and previews the current one", () => {
    const options = reportPeriodOptions("2026-01-15");
    expect(options).toHaveLength(12);
    expect(options[0]).toBe("2025-12");
    expect(options[11]).toBe("2025-01");
    expect(currentReportPeriod("2026-01-15")).toBe("2026-01");
  });

  it("keeps a month and a delivery from the address, and drops what the API would refuse", () => {
    expect(reportListSearch({ period: "2026-10", delivery: "no_recipient" })).toMatchObject({
      period: "2026-10",
      delivery: "no_recipient",
    });
    const dropped = reportListSearch({ period: "2026-13", delivery: "lost" });
    expect(dropped.period).toBeUndefined();
    expect(dropped.delivery).toBeUndefined();
  });
});

describe("the contact's box", () => {
  it("can be ticked only with an e-mail address", () => {
    expect(canReceiveReport("ayse@example.com")).toBe(true);
    expect(canReceiveReport("")).toBe(false);
    expect(canReceiveReport("   ")).toBe(false);
    expect(canReceiveReport(null)).toBe(false);
  });

  it("is cleared when the e-mail is, and not ticked again by typing it back", () => {
    expect(receivesAfterEmailChange(true, "")).toBe(false);
    expect(receivesAfterEmailChange(true, "ayse@example.com")).toBe(true);
    expect(receivesAfterEmailChange(false, "ayse@example.com")).toBe(false);
  });
});

describe("the requests", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    __resetClient();
    setAccessToken("token");
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("sends with the caller's Idempotency-Key, so a retry does not mail twice", async () => {
    const fetcher = installFetch({ "/customer-reports/r1/send/": jsonResponse(200, { id: "r1", delivery: "sent" }) });
    await sendCustomerReport("r1", "key-1");
    await sendCustomerReport("r1", "key-1");
    const calls = fetcher.callsTo("/customer-reports/r1/send/");
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST"]);
    expect(calls.map((call) => call.headers["idempotency-key"])).toEqual(["key-1", "key-1"]);
  });

  it("says the renderer is unavailable in the service-unavailable words", async () => {
    installFetch({ "/customer-reports/r1/send/": errorEnvelope(503, "SERVICE_UNAVAILABLE") });
    const error = await thrown(() => sendCustomerReport("r1", "key-2"));
    expect(error).toBeInstanceOf(ApiError);
    expect(errorMessage(error, t)).toBe(t("errors.SERVICE_UNAVAILABLE"));
  });

  it("words a send with nobody ticked", async () => {
    installFetch({ "/customer-reports/r1/send/": errorEnvelope(400, "REPORT_NO_RECIPIENT") });
    const error = await thrown(() => sendCustomerReport("r1", "key-3"));
    expect(errorMessage(error, t)).toContain("Aylık raporu alır");
  });

  it("downloads through the report's own link, not the attachments'", async () => {
    const fetcher = installFetch({
      "/customer-reports/r1/download-url/": jsonResponse(200, { download_url: "https://files.example/r1.pdf" }),
    });
    expect((await customerReportDownloadUrl("r1")).download_url).toBe("https://files.example/r1.pdf");
    expect(fetcher.calls.some((call) => call.path.includes("/attachments/"))).toBe(false);
  });

  it("previews a month as bytes, without a key: nothing is stored", async () => {
    const fetcher = installFetch({
      "/customer-reports/preview/": new Response("%PDF-1.4\n", { status: 200, headers: { "Content-Type": "application/pdf" } }),
    });
    const blob = await previewCustomerReport({ customer: "c1", period: "2026-10" });
    expect(await blob.text()).toBe("%PDF-1.4\n");
    const [call] = fetcher.callsTo("/customer-reports/preview/");
    expect(call.method).toBe("POST");
    expect(JSON.parse(call.body ?? "{}")).toEqual({ customer: "c1", period: "2026-10" });
  });

  it("asks the panel's page under the key the route warms", () => {
    expect(customerReportListQuery(customerReportPanelParams("c1")).queryKey).toEqual(
      customerReportListQuery({ customer: "c1", page_size: 12 }).queryKey,
    );
  });

  it("keeps the portal's reports under the portal's own key", () => {
    expect(portalReportsQuery().queryKey[0]).toBe(portalKeys.all[0]);
  });
});
