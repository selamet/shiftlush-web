/**
 * The request path, and what it does when the token has expired underneath it.
 *
 * Everything asserted here is invisible on a good connection with a fresh
 * token. It is the combination — an expired token *and* something going wrong
 * on the retry — that reaches a user, and that combination is the normal one
 * for a technician standing in a machine room with one bar of signal.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ApiError,
  __resetClient,
  api,
  hasAccessToken,
  onSessionExpired,
  setAccessToken,
} from "@/api/client";
import {
  abortError,
  deferred,
  errorEnvelope,
  installFetch,
  jsonResponse,
  networkDrop,
  noContent,
  thrown,
  type RecordedCall,
} from "./support";

const realFetch = globalThis.fetch;

beforeEach(() => {
  __resetClient();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Lets every queued promise reach its next await before the test continues. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the silent retry after a refresh", () => {
  it("refreshes once and replays the request with the new token", async () => {
    setAccessToken("stale");
    const fetcher = installFetch({
      "/customers": [errorEnvelope(401, "UNAUTHENTICATED"), jsonResponse(200, { items: [] })],
      "/auth/refresh": [jsonResponse(200, { access: "fresh" })],
    });

    expect(await api.get("/customers")).toEqual({ items: [] });

    expect(fetcher.calls.map((call) => call.path)).toEqual([
      "/api/v1/customers",
      "/api/v1/auth/refresh",
      "/api/v1/customers",
    ]);
    const attempts = fetcher.callsTo("/customers");
    expect(attempts[0].headers.authorization).toBe("Bearer stale");
    expect(attempts[1].headers.authorization).toBe("Bearer fresh");
    expect(hasAccessToken()).toBe(true);
  });

  it("replays the write under the same idempotency key", async () => {
    // A retry that mints a new key turns one intention into two records, which
    // is the exact failure the header exists to prevent.
    setAccessToken("stale");
    const fetcher = installFetch({
      "/customers": [errorEnvelope(401, "UNAUTHENTICATED"), jsonResponse(201, { id: "c1" })],
      "/auth/refresh": [jsonResponse(200, { access: "fresh" })],
    });

    await api.post("/customers", { name: "Site" }, { idempotencyKey: "key-1" });

    const attempts = fetcher.callsTo("/customers");
    expect(attempts.map((call) => call.headers["idempotency-key"])).toEqual(["key-1", "key-1"]);
    expect(attempts.map((call) => call.body)).toEqual([
      JSON.stringify({ name: "Site" }),
      JSON.stringify({ name: "Site" }),
    ]);
  });

  it("retries exactly once: a second 401 is reported, not retried again", async () => {
    setAccessToken("stale");
    let lost = 0;
    onSessionExpired(() => {
      lost += 1;
    });
    const fetcher = installFetch({
      "/customers": [
        errorEnvelope(401, "UNAUTHENTICATED", { requestId: "req-first" }),
        errorEnvelope(401, "FORBIDDEN", { requestId: "req-second" }),
      ],
      "/auth/refresh": [jsonResponse(200, { access: "fresh" })],
    });

    const error = (await thrown(() => api.get("/customers"))) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    // The *second* response is the one reported: after a good refresh the token
    // is not the problem, so the second answer is the honest one to show.
    expect(error.requestId).toBe("req-second");
    expect(error.code).toBe("FORBIDDEN");
    expect(fetcher.callsTo("/customers")).toHaveLength(2);
    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(1);
    // Not a lost session: a revoked permission is not a reason to sign anyone out.
    expect(lost).toBe(0);
    expect(fetcher.unexpected).toEqual([]);
  });

  it("ends the session when the refresh itself is refused", async () => {
    setAccessToken("stale");
    let lost = 0;
    onSessionExpired(() => {
      lost += 1;
    });
    const fetcher = installFetch({
      "/customers": [errorEnvelope(401, "UNAUTHENTICATED", { requestId: "req-first" })],
      "/auth/refresh": [errorEnvelope(401, "UNAUTHENTICATED")],
    });

    const error = (await thrown(() => api.get("/customers"))) as ApiError;

    expect(error.requestId).toBe("req-first");
    expect(hasAccessToken()).toBe(false);
    expect(lost).toBe(1);
    expect(fetcher.callsTo("/customers")).toHaveLength(1);
  });

  it("does not refresh on an anonymous call, and sends it no token", async () => {
    // A wrong password answers 401. Treating that as an expired token would
    // spend a refresh — and a rotated refresh token — on every typo.
    setAccessToken("stale");
    const fetcher = installFetch({
      "/auth/login": [errorEnvelope(401, "INVALID_CREDENTIALS")],
    });

    const error = (await thrown(() =>
      api.post("/auth/login", { email: "a@b.c", password: "x" }, { anonymous: true }),
    )) as ApiError;

    expect(error.code).toBe("INVALID_CREDENTIALS");
    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(0);
    expect(fetcher.callsTo("/auth/login")[0].headers.authorization).toBeUndefined();
  });
});

describe("a connection that drops on the retry", () => {
  it("reports the drop as NETWORK_ERROR rather than a raw TypeError", async () => {
    // The bug this suite was opened for. The first attempt is wrapped; before
    // the fix the replay was not, so a drop on the second attempt escaped as a
    // TypeError and every screen — which only knows ApiError — misread it.
    setAccessToken("stale");
    installFetch({
      "/customers": [errorEnvelope(401, "UNAUTHENTICATED"), networkDrop()],
      "/auth/refresh": [jsonResponse(200, { access: "fresh" })],
    });

    const error = await thrown(() => api.get("/customers"));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
    expect((error as ApiError).status).toBe(0);
  });

  it("still lets an abort on the retry through untouched", async () => {
    // The other half of the same guard: an abort is the caller changing its
    // mind. Dressed up as NETWORK_ERROR it puts an error toast on the screen
    // every time someone types another letter into a search box.
    setAccessToken("stale");
    installFetch({
      "/customers": [errorEnvelope(401, "UNAUTHENTICATED"), abortError()],
      "/auth/refresh": [jsonResponse(200, { access: "fresh" })],
    });

    const error = await thrown(() => api.get("/customers"));

    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("reports a drop on the first attempt as NETWORK_ERROR", async () => {
    installFetch({ "/customers": [networkDrop()] });

    const error = await thrown(() => api.get("/customers"));

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
  });

  it("lets an abort on the first attempt through untouched", async () => {
    installFetch({ "/customers": [abortError()] });

    const error = await thrown(() => api.get("/customers"));

    expect((error as DOMException).name).toBe("AbortError");
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe("collapsing concurrent refreshes", () => {
  it("answers ten simultaneous 401s with one call to /auth/refresh", async () => {
    // Load-bearing, and the failure is not merely wasteful: the server rotates
    // the refresh token on every use and reads a replayed one as theft, so the
    // second concurrent refresh revokes every session the user has.
    setAccessToken("stale");
    const gate = deferred<Response>();
    const fetcher = installFetch({
      "/customers": (call: RecordedCall) =>
        call.headers.authorization === "Bearer fresh"
          ? jsonResponse(200, { ok: true })
          : errorEnvelope(401, "UNAUTHENTICATED"),
      "/auth/refresh": () => gate.promise,
    });

    const inFlight = Array.from({ length: 10 }, () => api.get("/customers"));
    // Every one of the ten has now seen its 401 and is queued behind the refresh.
    await settle();
    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(1);

    gate.resolve(jsonResponse(200, { access: "fresh" }));
    const results = await Promise.all(inFlight);

    expect(results).toEqual(Array.from({ length: 10 }, () => ({ ok: true })));
    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(1);
    expect(fetcher.callsTo("/customers")).toHaveLength(20);
  });

  it("does not pin later requests to a refresh that already failed", async () => {
    // `refreshInFlight` is cleared in a `finally`. Without that, one refusal
    // during a blip would answer every request for the rest of the session.
    setAccessToken("stale");
    const fetcher = installFetch({
      "/customers": [
        errorEnvelope(401, "UNAUTHENTICATED"),
        errorEnvelope(401, "UNAUTHENTICATED"),
        jsonResponse(200, { items: [] }),
      ],
      "/auth/refresh": [errorEnvelope(503, "SERVICE_UNAVAILABLE"), jsonResponse(200, { access: "fresh" })],
    });

    await thrown(() => api.get("/customers"));
    expect(await api.get("/customers")).toEqual({ items: [] });

    expect(fetcher.callsTo("/auth/refresh")).toHaveLength(2);
    expect(fetcher.unexpected).toEqual([]);
  });

  it("recovers when the refresh call itself hits a dead connection", async () => {
    setAccessToken("stale");
    let lost = 0;
    onSessionExpired(() => {
      lost += 1;
    });
    installFetch({
      "/customers": [errorEnvelope(401, "UNAUTHENTICATED")],
      "/auth/refresh": [networkDrop()],
    });

    const error = (await thrown(() => api.get("/customers"))) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(lost).toBe(1);
    expect(hasAccessToken()).toBe(false);
  });
});

describe("turning a response into something a screen can render", () => {
  it("falls back to UNKNOWN_ERROR when the body is not the documented envelope", async () => {
    // A gateway timeout answers with an HTML page. The user gets a sentence.
    installFetch({ "/customers": [new Response("<html>504</html>", { status: 504 })] });

    const error = (await thrown(() => api.get("/customers"))) as ApiError;

    expect(error.code).toBe("UNKNOWN_ERROR");
    expect(error.status).toBe(504);
    expect(error.details).toEqual([]);
  });

  it("keys field errors by field and ignores the ones that name none", async () => {
    const error = new ApiError({
      code: "VALIDATION_ERROR",
      status: 422,
      details: [{ field: "email", code: "EMAIL_TAKEN" }, { code: "COMPANY_LIMIT_REACHED" }],
    });

    expect(error.byField()).toEqual({ email: "EMAIL_TAKEN" });
  });

  it("returns nothing for a 204 and for an empty 200", async () => {
    installFetch({
      "/customers/c1": [noContent()],
      "/customers/c2": [new Response("", { status: 200, headers: { "Content-Length": "0" } })],
    });

    expect(await api.delete("/customers/c1")).toBeUndefined();
    expect(await api.get("/customers/c2")).toBeUndefined();
  });

  it("hands back a blob for a response that is a file", async () => {
    installFetch({
      "/labels": [new Response("%PDF-1.7", { status: 200, headers: { "Content-Type": "application/pdf" } })],
    });

    const blob = await api.postFile("/labels", { ids: ["e1"] });

    expect(await blob.text()).toBe("%PDF-1.7");
  });

  it("omits query parameters that are empty, null or undefined", async () => {
    // A cleared search box must send no `q` at all; `q=` is a different question.
    const fetcher = installFetch({ "/elevators": [jsonResponse(200, { items: [] })] });

    await api.get("/elevators", { query: { q: "", page: 2, status: undefined, building: null } });

    expect(new URL(fetcher.calls[0].url).search).toBe("?page=2");
  });

  it("always sends credentials, so the refresh cookie can reach the server", async () => {
    const fetcher = installFetch({ "/customers": [jsonResponse(200, { items: [] })] });

    await api.get("/customers");

    expect(fetcher.calls[0].credentials).toBe("include");
  });
});

describe("__resetClient", () => {
  it("clears the token and the session-lost handler it advertises resetting", async () => {
    // The function is documented "Exposed for tests only" and every case above
    // leans on it. If it stopped clearing one of the three, the leak would show
    // up as a different test failing for no visible reason.
    let lost = 0;
    setAccessToken("stale");
    onSessionExpired(() => {
      lost += 1;
    });

    __resetClient();
    expect(hasAccessToken()).toBe(false);

    installFetch({
      "/customers": [errorEnvelope(401, "UNAUTHENTICATED")],
      "/auth/refresh": [errorEnvelope(401, "UNAUTHENTICATED")],
    });
    await thrown(() => api.get("/customers"));

    expect(lost).toBe(0);
  });
});
