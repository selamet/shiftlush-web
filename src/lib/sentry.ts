/**
 * The one place the Sentry SDK is imported.
 *
 * Two rules hold this file in place, and both are checked rather than trusted:
 *
 *   1. Nothing else under `src/` imports `@sentry/*`, and nothing but
 *      `main.tsx` imports this module. `scripts/smoke-render.mjs` renders every
 *      route under Node, where a browser SDK reaching for `window` at import
 *      time takes the render check down with it. `main.tsx` is the one module
 *      that render never loads.
 *   2. Every category of data collection is turned off by name. The policy that
 *      does the real work lives in `@/lib/observability`, which knows nothing
 *      about Sentry and can therefore be exercised on its own.
 *
 * `scripts/check-sentry-privacy.mjs` fails the build if either rule is broken.
 *
 * The SDK is imported statically rather than behind `await import(...)`. It
 * costs about 37 kB gzipped on a page load that may never report anything, and
 * it buys the first few hundred milliseconds after boot — the window where a
 * bad deploy throws before an async chunk could have arrived, which is
 * precisely the window worth hearing about.
 */
import * as Sentry from "@sentry/react";
import { scrubBreadcrumb, scrubEvent, setErrorReporter } from "@/lib/observability";

type InitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;

export interface InitOverrides {
  /** Overrides `VITE_SENTRY_DSN`. For the privacy check, which needs a client. */
  dsn?: string;
  /** Replaces the transport, so a test can read what would have been sent. */
  transport?: InitOptions["transport"];
}

/**
 * Starts reporting, if a destination has been configured.
 *
 * The DSN comes from the environment and never from a literal: a build for
 * staging has to be able to report somewhere other than production, and the
 * value belongs with the deployment rather than with the source. An absent DSN
 * initialises nothing at all — no client, no handlers, no requests — which is
 * local development, the render check and anyone running a build of this
 * repository who has no Sentry project of their own.
 *
 * Returns whether reporting was started, so the caller can say so if it wants.
 */
export function initSentry(overrides: InitOverrides = {}): boolean {
  const dsn = overrides.dsn ?? import.meta.env.VITE_SENTRY_DSN ?? "";
  if (!dsn) return false;

  Sentry.init({
    dsn,
    // `MODE` is "production" for any production build, which is every deploy of
    // this application. Naming the environment separately is what keeps a
    // staging deploy's errors out of the production project's list.
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,

    // ---------------------------------------------------------------------
    // Collection. Every category, off, by name.
    // ---------------------------------------------------------------------
    //
    // Omitting `dataCollection` entirely is not the same as this: with the
    // option absent the SDK falls back to the `sendDefaultPii` bridge, and with
    // the option present but partly filled in every field left out takes its
    // documented default — which is `true` for cookies, headers, bodies and
    // query parameters. Half a policy here is no policy.
    dataCollection: {
      // `user.*` filled in from instrumentation. This client has a signed-in
      // person's name and e-mail address in memory; neither belongs in a report.
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      // An empty array, not `false`: this is the list of body types to collect.
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      // Local variables lifted out of stack frames. In a sign-in handler the
      // local variable is the password.
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    // Superseded by `dataCollection` above and kept anyway: integrations that
    // read the old flag directly go on reading it, and this is the answer they
    // should get.
    sendDefaultPii: false,

    // No tracing and no session replay. Replay records the screen, which on
    // this product means recording somebody typing an identity number into a
    // form; it is not enabled here and must not be enabled without deciding
    // that question first.
    tracesSampleRate: 0,

    integrations: (defaults) => [
      ...defaults.filter((integration) => integration.name !== "Breadcrumbs"),
      // The same breadcrumbs, minus the console. Clicks, navigations and
      // requests are what make a report reproducible; console lines are
      // whatever anybody ever logged, which is not a surface that can be
      // reasoned about. Dropped here at collection time as well as in
      // `scrubBreadcrumb` on the way out.
      Sentry.breadcrumbsIntegration({ console: false }),
    ],

    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),

    transport: overrides.transport,
  });

  setErrorReporter((error, context) => {
    Sentry.withScope((scope) => {
      // The number on the user's screen, on the event, and — for the request
      // that caused it — on the backend's event too. One search instead of two.
      if (context.requestId) scope.setTag("request_id", context.requestId);
      if (context.boundary) scope.setTag("error_boundary", context.boundary);
      if (context.componentStack) scope.setExtra("component_stack", context.componentStack);
      // A boundary catching means the user is looking at a broken screen, which
      // is not the same severity as a handled failure.
      scope.setLevel("fatal");
      Sentry.captureException(error);
    });
  });

  return true;
}
