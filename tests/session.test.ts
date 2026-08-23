/**
 * Finding out, on a cold page load, whether anybody is signed in.
 *
 * The access token lives in memory and nowhere else, so every full reload
 * starts knowing nothing. The refresh cookie is httpOnly, which means the only
 * way to find out whether a session exists is to ask — and both the router
 * guard and the provider need the answer, at the same moment, before anything
 * renders. That is what `ensureSession` collapses into one call.
 *
 * A second call there is not merely wasteful: it goes to /auth/refresh, the
 * server rotates the refresh token on every use, and a replayed one is read as
 * theft — every session the user has is revoked. It looks like a random
 * sign-out that nobody can reproduce.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetClient, api, hasAccessToken } from "@/api/client";
import { ensureSession, forgetSession, initials } from "@/lib/session";
import { errorEnvelope, installFetch, jsonResponse, networkDrop } from "./support";

const realFetch = globalThis.fetch;

const SESSION = {
  access: "fresh-token",
  user: {
    id: "u1",
    role: "owner",
    full_name: "Mehmet Yilmaz",
    company_name: "Test Asansor",
    is_email_verified: true,
  },
};

beforeEach(() => {
  __resetClient();
  forgetSession();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("restoring a session", () => {
  it("asks once, anonymously, and keeps the token it gets back", async () => {
    const fetcher = installFetch({ "/auth/refresh": [jsonResponse(200, SESSION)] });

    expect(await ensureSession()).toEqual(SESSION.user);

    const call = fetcher.callsTo("/auth/refresh")[0];
    expect(call.method).toBe("POST");
    // Anonymous: there is no token yet, and asking with one would be a
    // different question than "does a session exist".
    expect(call.headers.authorization).toBeUndefined();
    // The refresh cookie is httpOnly; this is the only thing that sends it.
    expect(call.credentials).toBe("include");
    expect(hasAccessToken()).toBe(true);
  });

  it("leaves the token where the next request will pick it up", async () => {
    const fetcher = installFetch({
      "/auth/refresh": [jsonResponse(200, SESSION)],
      "/customers": [jsonResponse(200, { items: [] })],
    });

    await ensureSession();
    await api.get("/customers");

    expect(fetcher.callsTo("/customers")[0].headers.authorization).toBe("Bearer fresh-token");
  });

  it("answers eight simultaneous callers with a single call to the server", async () => {
    const fetcher = installFetch({ "/auth/refresh": jsonResponse(200, SESSION) });

    const answers = await Promise.all(Array.from({ length: 8 }, () => ensureSession()));

    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(1);
    expect(answers.every((answer) => answer === answers[0])).toBe(true);
  });

  it("does not ask again once it has an answer", async () => {
    const fetcher = installFetch({ "/auth/refresh": jsonResponse(200, SESSION) });

    await ensureSession();
    await ensureSession();
    await ensureSession();

    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(1);
  });

  it("asks again after a sign-in or sign-out has invalidated the answer", async () => {
    const fetcher = installFetch({ "/auth/refresh": jsonResponse(200, SESSION) });

    await ensureSession();
    forgetSession();
    await ensureSession();

    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(2);
  });
});

describe("a visitor who is not signed in", () => {
  it("treats the 401 as the answer rather than as a failure", async () => {
    // An anonymous visitor gets a 401 here on every page load. Rejecting would
    // make the router guard's happy path an exception handler.
    installFetch({ "/auth/refresh": [errorEnvelope(401, "AUTHENTICATION_FAILED")] });

    expect(await ensureSession()).toBeNull();
    expect(hasAccessToken()).toBe(false);
  });

  it("answers null when the connection is dead, rather than hanging or throwing", async () => {
    installFetch({ "/auth/refresh": [networkDrop()] });

    expect(await ensureSession()).toBeNull();
    expect(hasAccessToken()).toBe(false);
  });

  it("does not re-ask on every guard once the answer is no", async () => {
    const fetcher = installFetch({ "/auth/refresh": errorEnvelope(401, "AUTHENTICATION_FAILED") });

    expect(await ensureSession()).toBeNull();
    expect(await ensureSession()).toBeNull();

    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(1);
  });

  it("collapses concurrent callers even when the answer is no", async () => {
    const fetcher = installFetch({ "/auth/refresh": errorEnvelope(401, "AUTHENTICATION_FAILED") });

    const answers = await Promise.all(Array.from({ length: 5 }, () => ensureSession()));

    expect(answers).toEqual([null, null, null, null, null]);
    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(1);
  });
});

describe("initials", () => {
  it("uppercases in Turkish, where a dotless I is a different letter", () => {
    // The whole reason toLocaleUpperCase takes a locale here. In any other
    // locale this is "IÖ", and an avatar reading "IO" for İlker is wrong in a
    // way Turkish speakers notice immediately.
    expect(initials("ilker özdemir")).toBe("İÖ");
    expect(initials("ilker özdemir")).not.toBe("IÖ");
  });

  it("takes the first letter of the first two words and no more", () => {
    expect(initials("Ayse Nur Kaya")).toBe("AN");
    expect(initials("Mehmet")).toBe("M");
  });

  it("gives nothing back for a name that is not there", () => {
    expect(initials("")).toBe("");
  });
});
