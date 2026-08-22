/**
 * What may leave the browser when a screen breaks, and what may not.
 *
 * The backend answered this question first — `core/observability.py` in the API
 * repository — and the answer here is the same one with more force behind it.
 * A server error report carries the request that produced it; a browser error
 * report carries the page the user is standing on, the address bar, the referrer
 * and every line the application logged. This client holds national identity
 * numbers, passwords and invitation tokens, and all three of those are visible
 * from where the SDK is sitting.
 *
 * Sentry's React quickstart offers `dataCollection` with `userInfo` and
 * `httpBodies` commented out, which is collection *on*. Turning every category
 * off by name is therefore necessary. It is also not sufficient, and that is
 * measured rather than assumed — with the whole of `dataCollection` set to
 * false, the browser SDK still sends:
 *
 *   - `request.url`, the current address. `/invitation/<token>`,
 *     `/verify-email/<token>`, `/password-reset/<token>` and `/q/<token>` each
 *     carry a live credential in the path, and `?token=` carries one in the
 *     query string that `urlQueryParams: false` does not remove;
 *   - `request.headers.Referer`, which is the previous address and can carry
 *     exactly the same thing;
 *   - `console` breadcrumbs, holding the full arguments of every `console.log`
 *     the application ever made.
 *
 * So the flags are the belt and this module is the braces. Everything below
 * runs on the way out, after the SDK has assembled the event and before the
 * transport sees it.
 *
 * What is deliberately kept is the request id. Every API response carries it in
 * `X-Request-ID`, every error envelope repeats it in the body, the user reads it
 * off their own error screen, and the backend tags its Sentry events with it.
 * Putting it on the frontend event is what turns two searches into one.
 *
 * Nothing here imports the Sentry SDK. That is the point: this module is
 * reachable from the router, and the router is rendered under Node by
 * `scripts/smoke-render.mjs`, where a browser SDK that touches `window` at
 * import time would break the render check. The SDK is imported in exactly one
 * place — `src/lib/sentry.ts` — and that place is imported only by `main.tsx`.
 */
import type { Breadcrumb, Event as SentryEvent } from "@sentry/react";
import { ApiError, lastSeenRequestId } from "@/api/client";

/**
 * Keys whose value never leaves the browser, wherever it turns up.
 *
 * Defence in depth rather than the defence: bodies are not collected at all, so
 * in ordinary operation nothing here should ever match. It exists because
 * "should never match" and "does not match" are different claims, and only one
 * of them is testable — see `scripts/check-sentry-privacy.mjs`.
 *
 * Both spellings of each field: the API speaks snake_case and form state in
 * this client sometimes speaks camelCase, and a scrubber that knows only one of
 * them is a scrubber that works only on the paths somebody happened to test.
 */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "password",
  "current_password",
  "currentpassword",
  "new_password",
  "newpassword",
  "confirm_password",
  "confirmpassword",
  "national_id",
  "nationalid",
  "token",
  "qr_token",
  "qrtoken",
  "refresh",
  "access",
  "authorization",
  "cookie",
  "set-cookie",
  "idempotency-key",
]);

export const REDACTED = "[redacted]";

/** The only request headers allowed through. See `scrubEvent`. */
const KEPT_HEADERS: ReadonlySet<string> = new Set(["user-agent"]);

/**
 * Route prefixes whose next path segment is a live credential.
 *
 * These are the four links the transactional e-mails and the printed labels
 * point at. An error on any of them puts the token in `window.location.href`,
 * and from there into `request.url` of every event raised while the page is
 * open. An invitation token is a credential until it is used: mailing it to a
 * third party in an error report is handing over the account it opens.
 */
const CREDENTIAL_IN_PATH = /(\/(?:invitation|verify-email|password-reset|q))\/[^/?#]+/g;

/**
 * A URL with the parts that can carry a secret taken out of it.
 *
 * The query string goes whole rather than per-parameter. A list screen puts
 * whatever was typed into the search box into `?search=`, and what people type
 * into a search box on this product is a national identity number often enough
 * that guessing which parameters are safe is not a game worth playing. The
 * marker is left in place so a reader can see a query string was there.
 *
 * Relative URLs are handled without `new URL`: breadcrumbs carry both shapes,
 * and a parser that throws on one of them would be a scrubber that fails open.
 */
export function redactUrl(url: string): string {
  if (!url) return url;

  // The fragment goes entirely. Nothing in this application routes on it, so
  // anything found there arrived from somewhere unaudited.
  const [addressable] = url.split("#");
  const [path, query] = addressable.split("?");
  const masked = path.replace(CREDENTIAL_IN_PATH, (_match, prefix: string) => `${prefix}/${REDACTED}`);
  return query === undefined ? masked : `${masked}?${REDACTED}`;
}

/** Replaces anything sensitive, however deeply it is nested. */
function prune(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (Array.isArray(value)) return value.map((item) => prune(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : prune(item, depth + 1);
    }
    return result;
  }
  return value;
}

/**
 * One breadcrumb, stripped down to what is safe to keep.
 *
 * Console breadcrumbs are dropped whole rather than scrubbed. They hold the
 * arguments of every `console.log` in the application and in every dependency,
 * which is an unbounded surface: the key-name denylist above can only redact
 * what it recognises, and a payload logged while debugging a form is exactly
 * the shape it will not recognise. The click and navigation trail is what makes
 * a report reproducible anyway.
 *
 * Returns null for a breadcrumb that must not be recorded at all.
 */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;

  const data = breadcrumb.data ? { ...breadcrumb.data } : undefined;
  if (data) {
    // `url` on fetch and xhr, `from`/`to` on navigation. All three are URLs and
    // all three can name a token route or carry a search term.
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = redactUrl(data[key]);
    }
  }

  return {
    ...breadcrumb,
    data: data ? (prune(data) as Breadcrumb["data"]) : undefined,
  };
}

/**
 * One event, stripped down to what is safe to send.
 *
 * Also the place the request id becomes a tag, because a tag is what Sentry can
 * search on and the id is the number the user reads off their screen.
 */
export function scrubEvent<T extends SentryEvent>(event: T, requestId = lastSeenRequestId()): T {
  const request = event.request;
  if (request) {
    // The SDK is configured not to collect any of these. Deleting them anyway
    // means a future edit to those options — or a default that changes in a
    // minor release — cannot quietly start sending them.
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (typeof request.url === "string") request.url = redactUrl(request.url);

    // An allow-list rather than a denylist, so a header nobody thought about
    // is dropped rather than forwarded. Only the user agent survives: this
    // product is used on whatever phone the technician owns, and "only on
    // Samsung Internet" is often the whole diagnosis. The header that does not
    // survive is Referer — the previous URL, which is how the token in a
    // password-reset link follows the user onto the next page.
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())),
      );
    }
  }

  if (event.extra) event.extra = prune(event.extra) as SentryEvent["extra"];

  // Nothing in this client ever sets a user, and `dataCollection.userInfo` is
  // off so nothing else may either. Removing it unconditionally means an
  // integration that starts populating it does not get a free pass.
  delete event.user;

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }

  // Only when nothing better is already there. An error boundary reporting an
  // ApiError tags the event with that error's own id — the exact request the
  // backend also reported — and this fallback is for everything else: an
  // unhandled rejection, a render error three clicks after the last call. Set
  // unconditionally, the fallback would overwrite the specific answer with the
  // approximate one on precisely the reports that had the specific answer.
  if (requestId && !event.tags?.request_id) {
    event.tags = { ...event.tags, request_id: requestId };
  }

  return event;
}

/**
 * The id to show the user and to tag the event with.
 *
 * An `ApiError` knows the id of the response that produced it, which is the
 * exact request the backend also reported. Anything else — a render error in a
 * component, a bug with no server involvement — takes the id of the last
 * response this tab received, which is the nearest point in the backend's own
 * logs to where the user was when it broke.
 */
export function errorReference(error: unknown): string {
  if (error instanceof ApiError && error.requestId) return error.requestId;
  return lastSeenRequestId();
}

export interface ErrorContext {
  /** Which boundary caught it: the shell's, or the one around everything. */
  boundary?: string;
  /** React's component stack. Names of components, and nothing else. */
  componentStack?: string;
}

type Reporter = (error: unknown, context: ErrorContext & { requestId: string }) => void;

let reporter: Reporter | null = null;

/**
 * Registers the thing that actually sends. Called by `initSentry`, and only
 * when a DSN was configured — so with no DSN there is no reporter and
 * `reportError` is a no-op, which is local development and the render check.
 */
export function setErrorReporter(next: Reporter | null): void {
  reporter = next;
}

/** Sends an error that a boundary has already caught. Never throws. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    reporter?.(error, { ...context, requestId: errorReference(error) });
  } catch {
    // The caller is an error boundary that is already rendering a failure.
    // Throwing out of the reporter would replace a handled error with an
    // unhandled one, which is the blank screen this whole change exists to
    // remove. There is nowhere left to report this to, by definition.
  }
}

/** Exposed for the privacy check only: resets module state between cases. */
export function __resetObservability(): void {
  reporter = null;
}
