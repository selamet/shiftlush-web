/**
 * The contact form's monthly-report box: it travels by e-mail, so the box is
 * disabled while there is no address, and clearing the address unticks it.
 */

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/lib/i18n";

const customer = vi.hoisted(() => ({
  value: {
    id: "c1",
    name: "Acme",
    contacts: [
      { id: "k1", name: "Ayse", email: "ayse@example.com", receives_monthly_report: true, is_primary: false },
    ],
  } as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => React.createElement("a", null, children),
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "c1", contactId: "k1" }),
}));

vi.mock("@/api/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/queries")>()),
  customerQuery: () => ({ queryKey: ["customer-test"], queryFn: async () => customer.value }),
}));

import { ContactFormScreen } from "@/screens/ContactFormScreen";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount() {
  act(() => {
    root.render(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        React.createElement(ContactFormScreen),
      ),
    );
  });
  // Until the customer has loaded and the form is on screen, not a fixed tick:
  // a loaded machine takes longer than one.
  for (let attempt = 0; attempt < 50 && !container.querySelector("#kf-receives-report"); attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

function field(selector: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

function typeEmail(value: string) {
  const input = field("#kf-email");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the monthly report box on the contact form", () => {
  it("is disabled, unticked and explained when there is no e-mail", async () => {
    customer.value = { ...customer.value, contacts: [{ id: "k1", name: "Ayse", email: "", receives_monthly_report: false }] };
    await mount();
    const box = field("#kf-receives-report");
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(container.textContent).toContain(i18n.t("contact.receivesMonthlyReportNeedsEmail"));
  });

  it("is ticked while there is an e-mail, and clearing the e-mail unticks and disables it", async () => {
    customer.value = {
      ...customer.value,
      contacts: [{ id: "k1", name: "Ayse", email: "ayse@example.com", receives_monthly_report: true }],
    };
    await mount();
    const box = field("#kf-receives-report");
    expect(box.disabled).toBe(false);
    expect(box.checked).toBe(true);

    typeEmail("");
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
  });
});
