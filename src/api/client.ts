/**
 * The one place this application talks to the server.
 *
 * Three things live here because they are the same problem seen from different
 * angles: where the access token is kept, what happens when it expires, and how
 * a server error becomes a sentence a person can read.
 *
 * The access token is held in a module variable and nowhere else. Not
 * localStorage, not sessionStorage, not a readable cookie — an injected script
 * that can read the token owns the account until it expires, and the whole
 * point of a fifteen-minute token is that the window stays small. The cost is
 * that a full page reload starts with no token and has to call `/auth/refresh`
 * before it knows who the user is; that gap is a real, visible state and the
 * shell renders a skeleton during it.
 */
import type { components } from "@/api/generated";

export type ErrorCode = components["schemas"]["ErrorCode"];

/** Codes the client raises itself. The server has no way to send these. */
export type ClientErrorCode = "NETWORK_ERROR" | "UNKNOWN_ERROR";

export interface FieldError {
  field?: string;
  code: string;
}

/**
 * Every failure reaching a screen is one of these.
 *
 * Screens never see a raw Response or a thrown TypeError, so no screen has to
 * decide what an unhandled shape means — that decision is made once, here.
 */
export class ApiError extends Error {
  readonly code: ErrorCode | ClientErrorCode;
  readonly status: number;
  readonly requestId: string;
  readonly details: FieldError[];

  constructor(init: {
    code: ErrorCode | ClientErrorCode;
    status: number;
    requestId?: string;
    details?: FieldError[];
  }) {
    super(init.code);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId ?? "";
    this.details = init.details ?? [];
  }

  /** Field errors keyed by field name, for driving form validation. */
  byField(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const detail of this.details) {
      if (detail.field) map[detail.field] = detail.code;
    }
    return map;
  }
}

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

/**
 * The header the API puts on every response, honouring one the client sent if
 * there was one. See `RequestIdMiddleware` in the API repository.
 */
const REQUEST_ID_HEADER = "X-Request-ID";

/**
 * The id of the most recent response the server tagged.
 *
 * Kept so that an error with no server involvement — a render error in a
 * component, a bug three clicks after the last request — still has a number
 * against it. The backend tags its own error reports with the same id, so this
 * is what makes a frontend report and its backend cause one search rather than
 * two, and it is the number the user reads off their own screen.
 *
 * Two sources, because only one of them works today. The header is on every
 * response, including the successful ones, but a browser hides a response
 * header the server has not named in `Access-Control-Expose-Headers` and
 * `X-Request-ID` is not yet on that list — so cross-origin, `headers.get`
 * returns null and this stays empty. The error envelope carries the same id in
 * its body, which is not subject to that rule, so failures are covered either
 * way and successes start being covered the day the backend exposes the header.
 */
let lastRequestId = "";

export function lastSeenRequestId(): string {
  return lastRequestId;
}

function noteRequestId(id: string | null | undefined): void {
  if (id) lastRequestId = id;
}

let accessToken: string | null = null;

/** Called when the session ends for a reason the user did not choose. */
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

export function onSessionExpired(handler: () => void): void {
  onSessionLost = handler;
}

/**
 * The in-flight refresh, if there is one.
 *
 * Without this, ten requests firing at once on a stale token produce ten
 * refresh calls. The server rotates the refresh token on every use and treats a
 * replayed one as theft — it revokes every session — so the second concurrent
 * refresh would not merely be wasteful, it would sign the user out and look
 * like a bug nobody can reproduce.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        // The refresh token is an httpOnly cookie; this is what sends it.
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { access?: string };
      if (!body.access) return false;
      accessToken = body.access;
      return true;
    } catch {
      return false;
    } finally {
      // Cleared in `finally` so a failed refresh does not pin every later
      // request to the same rejected promise.
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code: ErrorCode | ClientErrorCode = "UNKNOWN_ERROR";
  let requestId = "";
  let details: FieldError[] = [];

  try {
    const body = (await response.json()) as {
      error?: { code?: string; request_id?: string; details?: FieldError[] };
    };
    if (body.error?.code) code = body.error.code as ErrorCode;
    requestId = body.error?.request_id ?? "";
    details = body.error?.details ?? [];
    noteRequestId(requestId);
  } catch {
    // A response that is not the documented envelope — a proxy error page, a
    // gateway timeout. Falling through to UNKNOWN_ERROR is correct: the user
    // gets a sentence and a request id rather than a blank screen.
  }

  return new ApiError({ code, status: response.status, requestId, details });
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Skips the token and the refresh cycle. For login, register and refresh. */
  anonymous?: boolean;
  /** Set on retryable creates so a dropped connection cannot double-submit. */
  idempotencyKey?: string;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${BASE_URL}/api/v1${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (!options.anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers,
    // Always included: the refresh cookie has to reach /auth/refresh, and
    // varying this per call is how one endpoint quietly stops working.
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  noteRequestId(response.headers.get(REQUEST_ID_HEADER));
  return response;
}

/**
 * One attempt, with the two failures `fetch` reports by throwing turned into
 * something a screen already knows how to read.
 *
 * A function rather than an inline try/catch, and that is the whole point of
 * it: every attempt has to be wrapped, and an attempt that is not throws a raw
 * TypeError. Screens and `useSubmit` only ever narrow to `ApiError`, so an
 * unwrapped attempt surfaces as an unhandled failure instead of "connection
 * lost". The wrapping used to sit around the first attempt only, which left the
 * post-refresh replay — the attempt most likely to be running on a connection
 * that is already struggling — outside it.
 */
async function attempt(path: string, options: RequestOptions): Promise<Response> {
  try {
    return await send(path, options);
  } catch (error) {
    // An aborted request is the caller changing its mind, not a failure to
    // report; letting it surface as NETWORK_ERROR would flash an error toast
    // every time someone types in a search box.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError({ code: "NETWORK_ERROR", status: 0 });
  }
}

/**
 * One request, with the token attached and one silent retry after a refresh.
 *
 * Retried exactly once. A second 401 after a successful refresh means the
 * problem is not the token — it is permission, or a revoked account — and
 * retrying again would spin.
 *
 * Returns the Response rather than a body, because not every endpoint answers
 * with JSON: the label sheet answers with a PDF. Everything up to "this
 * response is good" is identical for both, and that is the part with the token,
 * the refresh and the error envelope in it — the part that must not exist twice.
 */
async function sendWithAuth(path: string, options: RequestOptions): Promise<Response> {
  let response = await attempt(path, options);

  if (response.status === 401 && !options.anonymous) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      accessToken = null;
      onSessionLost?.();
      throw await toApiError(response);
    }
    response = await attempt(path, options);
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await sendWithAuth(path, options);

  // 204, and 200s with an empty body.
  if (response.status === 204 || response.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * A response that is a file rather than a record.
 *
 * The label sheet is a PDF built by the server and it is fetched, not linked:
 * the endpoint is a POST — the identifiers go in the body because a firm
 * printing its whole estate would build a URL no proxy accepts — and it needs
 * the bearer token, which an anchor cannot carry. What the caller does with the
 * blob is the caller's problem; this only promises it arrived.
 */
export async function requestFile(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await sendWithAuth(path, options);
  return await response.blob();
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE" }),
  postFile: (path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    requestFile(path, { ...options, method: "POST", body }),
};

/** Exposed for tests only: resets module state between cases. */
export function __resetClient(): void {
  accessToken = null;
  refreshInFlight = null;
  onSessionLost = null;
  lastRequestId = "";
}
