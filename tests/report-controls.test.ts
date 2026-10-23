/**
 * The report buttons, driven through jsdom with the API mocked.
 *
 * Two behaviours are pinned here because neither can be seen from a pure
 * function: the send key's lifetime across a failure and a success, and the
 * download opening its window inside the click rather than after the await.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CustomerReport } from "@/api/queries";
import i18n from "@/lib/i18n";

const api = vi.hoisted(() => ({
  sendCustomerReport: vi.fn(),
  customerReportDownloadUrl: vi.fn(),
}));

vi.mock("@/api/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/queries")>()),
  sendCustomerReport: api.sendCustomerReport,
  customerReportDownloadUrl: api.customerReportDownloadUrl,
}));

import { DownloadReportButton, SendReportButton, useOpenReport } from "@/components/reports/ReportControls";

const REPORT = {
  id: "r1",
  period: "2026-10",
  customer_name: "Acme",
  file: "reports/r1.pdf",
  sent_at: null,
} as unknown as CustomerReport;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  api.sendCustomerReport.mockReset();
  api.customerReportDownloadUrl.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function mount(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  act(() => {
    root.render(React.createElement(QueryClientProvider, { client }, element));
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function click(element: Element) {
  act(() => {
    (element as HTMLElement).click();
  });
}

function buttonWithText(scope: ParentNode, text: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`no button says "${text}"`);
  return found;
}

/** Presses Send, then confirms in the dialog, and lets the request settle. */
async function sendOnce() {
  const label = i18n.t("report.send");
  click(buttonWithText(container, label));
  const dialog = container.querySelector('[role="alertdialog"]');
  if (!dialog) throw new Error("the confirmation did not open");
  click(buttonWithText(dialog, label));
  await flush();
}

describe("the send key", () => {
  it("is the same after a failed send, so a retry replays instead of mailing twice", async () => {
    api.sendCustomerReport.mockRejectedValueOnce(new Error("dropped")).mockResolvedValueOnce({});
    mount(React.createElement(SendReportButton, { report: REPORT }));
    await sendOnce();
    await sendOnce();
    const keys = api.sendCustomerReport.mock.calls.map((call) => call[1]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("changes after a successful send, so the next send is a new one", async () => {
    api.sendCustomerReport.mockResolvedValue({});
    mount(React.createElement(SendReportButton, { report: REPORT }));
    await sendOnce();
    await sendOnce();
    const keys = api.sendCustomerReport.mock.calls.map((call) => call[1]);
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });
});

function Opener({ onSettled }: { onSettled?: () => void }) {
  const opener = useOpenReport();
  void onSettled;
  return React.createElement(
    "div",
    null,
    React.createElement(DownloadReportButton, { report: REPORT, onOpen: opener.open }),
    opener.failure && React.createElement("p", { role: "alert" }, opener.failure),
  );
}

describe("downloading a report", () => {
  function stubWindow() {
    const popup = { location: { href: "" }, opener: {} as unknown, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    return { popup, open };
  }

  it("opens its window inside the click, before the link is known, and points it at the link after", async () => {
    const { popup, open } = stubWindow();
    let resolveUrl: (value: { download_url: string }) => void = () => {};
    api.customerReportDownloadUrl.mockReturnValue(new Promise((resolve) => (resolveUrl = resolve)));
    mount(React.createElement(Opener));

    click(buttonWithText(container, i18n.t("report.download")));
    // Nothing has resolved yet: this is the moment a popup blocker judges.
    expect(open).toHaveBeenCalledTimes(1);
    expect(popup.location.href).toBe("");

    resolveUrl({ download_url: "https://files.example/r1.pdf" });
    await flush();
    expect(popup.location.href).toBe("https://files.example/r1.pdf");
    expect(popup.opener).toBeNull();
  });

  it("closes the window it opened when the link cannot be had, and says so", async () => {
    const { popup } = stubWindow();
    api.customerReportDownloadUrl.mockRejectedValue(new Error("nope"));
    mount(React.createElement(Opener));

    click(buttonWithText(container, i18n.t("report.download")));
    await flush();
    expect(popup.close).toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
