/**
 * The reports panel on a customer, and what it must forget when the customer
 * changes: a preview rendered for customer A is A's PDF, and back/forward
 * between two customers reuses the same component instance.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/lib/i18n";

const api = vi.hoisted(() => ({ previewCustomerReport: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children),
}));

vi.mock("@/api/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/queries")>()),
  previewCustomerReport: api.previewCustomerReport,
  customerReportListQuery: (params: unknown) => ({
    queryKey: ["customer-report-list-test", params],
    queryFn: async () => ({ results: [], pagination: { total: 0 } }),
  }),
}));

import { SessionProvider } from "@/lib/session";
import { CustomerReportsPanel } from "@/components/reports/CustomerReportsPanel";

let container: HTMLDivElement;
let root: Root;
// One client for the whole test: a new one per render would remount the tree and
// make the test pass whether or not the panel is keyed.
let client: QueryClient;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  api.previewCustomerReport.mockReset();
  api.previewCustomerReport.mockResolvedValue(new Blob(["pdf"]));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(customerId: string) {
  act(() => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          SessionProvider,
          { override: { role: "admin", fullName: "A", companyName: "C" }, children: null },
          React.createElement(CustomerReportsPanel, { customerId }),
        ),
      ),
    );
  });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("the customer reports panel", () => {
  it("does not carry one customer's preview over to the next", async () => {
    render("customer-a");
    const preview = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(i18n.t("report.previewThisMonth")),
    );
    if (!preview) throw new Error("the preview button did not render");
    act(() => preview.click());
    await flush();
    expect(container.querySelector("a[download]")).not.toBeNull();

    render("customer-b");
    await flush();
    expect(container.querySelector("a[download]")).toBeNull();
  });
});
