/**
 * The customer portal's decisions, and the wall between its session and the
 * staff one.
 *
 * The wall is the property that matters most: a staff token sent to a portal
 * endpoint, or a portal token to a staff one, is the failure M6 was designed
 * against. Both clients refuse the other's paths before anything is sent, and
 * these cases check that they do — with a fetch that fails the test if it is
 * ever reached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { components } from "@/api/generated";
import { api, isPortalPath, setAccessToken, __resetClient } from "@/api/client";
import {
  __resetPortalClient,
  portal,
  setPortalAccessToken,
  shouldRefreshAfter,
} from "@/api/portal-client";
import { isOpenFault, liftAttention, portalAccessFor } from "@/lib/portal";

type PortalAccount = components["schemas"]["PortalAccount"];

describe("the wall between the two sessions", () => {
  const realFetch = globalThis.fetch;
  let calls: Array<{ url: string; auth: string | undefined }>;

  beforeEach(() => {
    __resetClient();
    __resetPortalClient();
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(input), auth: headers.Authorization });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("knows a portal path when it sees one", () => {
    expect(isPortalPath("/portal/me")).toBe(true);
    expect(isPortalPath("/portal")).toBe(true);
    expect(isPortalPath("/portal-accounts/a1/deactivate/")).toBe(false);
    expect(isPortalPath("/customers/c1/portal-invitations/")).toBe(false);
  });

  it("never lets the staff client call a portal path", async () => {
    setAccessToken("staff-token");
    await expect(api.get("/portal/me")).rejects.toThrow(/portal/);
    expect(calls).toEqual([]);
  });

  it("never lets the portal client call a staff path", async () => {
    setPortalAccessToken("portal-token");
    await expect(portal.api.get("/elevators/")).rejects.toThrow(/portal/);
    expect(calls).toEqual([]);
  });

  it("sends each client's own token, and only that one", async () => {
    setAccessToken("staff-token");
    setPortalAccessToken("portal-token");
    await api.get("/elevators/");
    await portal.api.get("/portal/me");
    expect(calls.map((call) => call.auth)).toEqual(["Bearer staff-token", "Bearer portal-token"]);
  });

  it("sends no token at all on an anonymous portal call", async () => {
    setPortalAccessToken("portal-token");
    await portal.api.post("/portal/auth/login", { email: "a@b.c", password: "x" }, { anonymous: true });
    expect(calls[0].auth).toBeUndefined();
  });
});

describe("shouldRefreshAfter", () => {
  it("refreshes once after a 401 on a call that carried the token", () => {
    expect(shouldRefreshAfter(401, "/portal/me", false)).toBe(true);
  });

  it("does not refresh on anything else, an anonymous call, or the refresh itself", () => {
    expect(shouldRefreshAfter(403, "/portal/me", false)).toBe(false);
    expect(shouldRefreshAfter(401, "/portal/auth/login", true)).toBe(false);
    expect(shouldRefreshAfter(401, "/portal/auth/refresh", false)).toBe(false);
  });
});

describe("what the home screen says about a lift", () => {
  const today = "2026-10-21";
  const lift = {
    id: "e1",
    status: "active",
    next_inspection_date: "2027-03-14",
    next_maintenance_date: "2026-11-13",
  };

  it("says all is well when nothing is due or broken", () => {
    expect(liftAttention(lift, [], today)).toEqual({ attention: "ok", openFaults: 0 });
  });

  it("puts a lift that is not running first, ahead of its faults", () => {
    expect(
      liftAttention({ ...lift, status: "out_of_service" }, [{ elevator: "e1", status: "open" }], today).attention,
    ).toBe("out_of_service");
    expect(liftAttention({ ...lift, status: "sealed" }, [], today).attention).toBe("out_of_service");
  });

  it("counts only this lift's open faults, not resolved ones or another lift's", () => {
    const faults = [
      { elevator: "e1", status: "assigned" as const },
      { elevator: "e1", status: "resolved" as const },
      { elevator: "e2", status: "open" as const },
    ];
    expect(liftAttention(lift, faults, today)).toEqual({ attention: "fault", openFaults: 1 });
  });

  it("flags an overdue inspection before an overdue maintenance visit", () => {
    expect(
      liftAttention({ ...lift, next_inspection_date: "2026-10-01", next_maintenance_date: "2026-10-01" }, [], today)
        .attention,
    ).toBe("inspection_overdue");
    expect(liftAttention({ ...lift, next_maintenance_date: "2026-10-20" }, [], today).attention).toBe(
      "maintenance_overdue",
    );
  });

  it("flags an open correction deadline ahead of an overdue inspection, but after a fault", () => {
    const red = { ...lift, correction_deadline: "2026-11-20", next_inspection_date: "2026-10-01" };
    expect(liftAttention(red, [], today).attention).toBe("correction");
    expect(liftAttention(red, [{ elevator: "e1", status: "open" }], today).attention).toBe("fault");
    expect(liftAttention({ ...lift, correction_deadline: null }, [], today).attention).toBe("ok");
  });

  it("treats open, assigned and on site as open, and the rest as done", () => {
    expect(["open", "assigned", "on_site"].every((status) => isOpenFault(status as never))).toBe(true);
    expect(["resolved", "closed", "cancelled"].some((status) => isOpenFault(status as never))).toBe(false);
  });
});

describe("portal access for a contact", () => {
  function account(overrides: Partial<PortalAccount>): PortalAccount {
    return {
      id: "pa1",
      email: "a@b.c",
      customer: "c1",
      contact: "k1",
      contact_name: "Ayşe",
      status: "active",
      invited_at: "2026-10-01T09:00:00Z",
      accepted_at: "2026-10-02T09:00:00Z",
      deactivated_at: null,
      last_login_at: null,
      ...overrides,
    };
  }

  it("offers an invitation to a contact never invited, if they have an e-mail", () => {
    expect(portalAccessFor({ id: "k1", email: "a@b.c" }, [])).toMatchObject({
      state: "none",
      canInvite: true,
      blocked: null,
      canDeactivate: false,
    });
  });

  it("says why a contact without an e-mail cannot be invited", () => {
    expect(portalAccessFor({ id: "k1", email: "  " }, [])).toMatchObject({ canInvite: false, blocked: "noEmail" });
  });

  it("does not re-invite an active account, but lets it be switched off", () => {
    expect(portalAccessFor({ id: "k1", email: "a@b.c" }, [account({})])).toMatchObject({
      state: "active",
      canInvite: false,
      blocked: "alreadyActive",
      canDeactivate: true,
    });
  });

  it("re-invites a pending invitation or a switched-off account, by the newest account", () => {
    const old = account({ id: "pa0", status: "inactive", invited_at: "2026-01-01T09:00:00Z" });
    const pending = account({ id: "pa2", status: "invited", invited_at: "2026-10-10T09:00:00Z", accepted_at: null });
    const access = portalAccessFor({ id: "k1", email: "a@b.c" }, [old, pending]);
    expect(access.account?.id).toBe("pa2");
    expect(access).toMatchObject({ state: "invited", canInvite: true });
    expect(portalAccessFor({ id: "k1", email: "a@b.c" }, [old])).toMatchObject({ state: "inactive", canInvite: true });
  });
});
