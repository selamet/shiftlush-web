/**
 * The customer portal's own way of talking to the server (M6).
 *
 * A sibling of `client.ts`, not a mode of it. The portal is a different
 * principal — a building manager's portal account, not a member of the firm —
 * with its own access token, its own refresh cookie (`portal_refresh`, scoped
 * by the server to `/api/v1/portal/`) and its own audience on every token. The
 * two clients share the error envelope, the base URL and nothing else: no
 * token, no refresh promise, no "session lost" handler. A staff token sent to
 * a portal endpoint, or the other way round, is the failure this file exists
 * to make impossible, so each client refuses the other's paths before a
 * request is built.
 *
 * The token lives in a module variable for the reason the staff one does: an
 * injected script that can read it owns the account until it expires.
 */
import type { components } from "@/api/generated";
import {
  ApiError,
  buildUrl,
  isPortalPath,
  noteRequestId,
  toApiError,
  type RequestOptions,
} from "@/api/client";

type PortalTokenResponse = components["schemas"]["PortalTokenResponse"];

let portalToken: string | null = null;
let refreshInFlight: Promise<PortalTokenResponse | null> | null = null;
let onPortalSessionLost: (() => void) | null = null;

export function setPortalAccessToken(token: string | null): void {
  portalToken = token;
}

export function hasPortalAccessToken(): boolean {
  return portalToken !== null;
}

/** Called when a refresh fails mid-session: the portal session is over. */
export function onPortalSessionExpired(handler: (() => void) | null): void {
  onPortalSessionLost = handler;
}

/**
 * Whether a failed response is worth one silent refresh and a replay.
 *
 * Only a 401, only on a call that carries the token, and never on the refresh
 * itself — a refresh answered 401 means there is no session, and asking again
 * would spin.
 */
export function shouldRefreshAfter(status: number, path: string, anonymous: boolean): boolean {
  return status === 401 && !anonymous && path !== "/portal/auth/refresh";
}

/**
 * Exchanging the portal refresh cookie for a new access token.
 *
 * One at a time, for the reason the staff client gives: the server rotates the
 * refresh token on every use, so two concurrent refreshes would replay one and
 * end the session.
 */
export function refreshPortalSession(): Promise<PortalTokenResponse | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(buildUrl("/portal/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as PortalTokenResponse;
      if (!body.access) return null;
      portalToken = body.access;
      return body;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function attempt(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (!options.anonymous && portalToken) headers.Authorization = `Bearer ${portalToken}`;
  try {
    const response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      // The portal refresh cookie has to reach /portal/auth/*.
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
    noteRequestId(response.headers.get("X-Request-ID"));
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError({ code: "NETWORK_ERROR", status: 0 });
  }
}

async function portalRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!isPortalPath(path)) {
    // The mirror of the staff client's guard: a portal token never leaves the
    // portal's own endpoints.
    throw new Error(`The portal client calls portal paths only: ${path}`);
  }
  let response = await attempt(path, options);
  if (shouldRefreshAfter(response.status, path, Boolean(options.anonymous))) {
    const refreshed = await refreshPortalSession();
    if (!refreshed) {
      portalToken = null;
      onPortalSessionLost?.();
      throw await toApiError(response);
    }
    response = await attempt(path, options);
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204 || response.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  return (await response.json()) as T;
}

type Options = Omit<RequestOptions, "method" | "body">;

/**
 * Spelled `portal.api.get(...)` so the path linter, which reads every
 * `api.<verb>("...")` call, checks the portal's paths against the contract too.
 */
export const portal = {
  api: {
    get: <T>(path: string, options?: Options) => portalRequest<T>(path, { ...options, method: "GET" }),
    post: <T>(path: string, body?: unknown, options?: Options) =>
      portalRequest<T>(path, { ...options, method: "POST", body }),
  },
};

/** Exposed for tests only. */
export function __resetPortalClient(): void {
  portalToken = null;
  refreshInFlight = null;
  onPortalSessionLost = null;
}
