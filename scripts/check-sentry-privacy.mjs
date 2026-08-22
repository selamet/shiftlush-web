#!/usr/bin/env node
/**
 * Fails if an error report could carry the data that caused it.
 *
 * The point of this is not that a scrubbing function exists. It is that a
 * national identity number typed into a form, a password typed into a sign-in,
 * and an invitation token sitting in the address bar cannot reach a third party
 * by way of an error report — which is a claim about the whole path, not about
 * one function.
 *
 * So the transport is replaced and the envelopes it would have sent are read
 * back, through the application's own `initSentry` and the application's own
 * API client. A check that asserted `dataCollection.userInfo === false` would
 * pass while all of the following sailed out, because with the whole of
 * `dataCollection` set to false the browser SDK still sends:
 *
 *   - `request.url`, which on /invitation/<token>, /verify-email/<token>,
 *     /password-reset/<token> and /q/<token> is a live credential, and which
 *     keeps its `?token=` query string despite `urlQueryParams: false`;
 *   - `request.headers.Referer`, which is the previous URL and can carry the
 *     same, despite `httpHeaders.request: false`;
 *   - `console` breadcrumbs, holding the arguments of every console.log.
 *
 * Every one of those is planted below and asserted absent.
 *
 * And the check checks itself. The same fixtures are fed to a second client
 * configured the way Sentry's quickstart leaves it — no beforeSend, no
 * beforeBreadcrumb, `dataCollection` commented out — and every secret must come
 * out the other side. If it does not, the fixture has stopped reaching that
 * channel and the silence in the real case proves nothing: a check that catches
 * nothing still counts as coverage while protecting nothing.
 */
import { createServer } from "vite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

// ---------------------------------------------------------------------------
// The fixtures. One per channel the SDK collects through.
// ---------------------------------------------------------------------------

const NATIONAL_ID = "12345678901";
const PASSWORD = "correct-horse-battery";
/** In the path of the page the user is on, and in its query string. */
const INVITATION_TOKEN = "invitation-token-that-is-a-credential";
/** In the referrer, which is how the previous page's token follows you. */
const RESET_TOKEN = "password-reset-token-that-is-a-credential";

const PAGE_URL = `https://app.example/invitation/${INVITATION_TOKEN}?token=${INVITATION_TOKEN}`;
const REFERRER = `https://app.example/password-reset/${RESET_TOKEN}`;

/** Everything that must never appear in an envelope, and where it comes from. */
const SECRETS = [
  [NATIONAL_ID, "a national identity number, through the console and a search query"],
  [PASSWORD, "a password, through a console line"],
  [INVITATION_TOKEN, "an invitation token, through the page URL"],
  [RESET_TOKEN, "a password-reset token, through the referrer"],
];

// ---------------------------------------------------------------------------
// A browser, near enough. The SDK is a browser SDK and this is Node.
// ---------------------------------------------------------------------------

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};
globalThis.document = {
  documentElement: { classList: { toggle() {} } },
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
  visibilityState: "visible",
  location: { href: PAGE_URL },
  referrer: REFERRER,
};
globalThis.window = globalThis;
globalThis.location = {
  href: PAGE_URL,
  origin: "https://app.example",
  pathname: `/invitation/${INVITATION_TOKEN}`,
  search: `?token=${INVITATION_TOKEN}`,
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

/**
 * The server, for the API client to talk to.
 *
 * Stubbed before the SDK is initialised so its fetch instrumentation wraps this
 * and records a breadcrumb for every call — including the query string, which
 * on a list screen is whatever was typed into the search box.
 */
let nextResponse = () => new Response("{}", { status: 200 });
globalThis.fetch = async () => nextResponse();

// ---------------------------------------------------------------------------

const problems = [];
const fail = (...lines) => problems.push(lines.join("\n"));

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
  // No .env file is read.
  //
  // Two reasons, and the second is the important one. `initSentry()` is called
  // below with no DSN to prove that it starts nothing, and a developer with a
  // real DSN in .env.local would otherwise fail that case for a reason that is
  // not a fault. And nothing in this check may ever reach the network: every
  // client it builds is given a transport that collects, but an env-supplied
  // DSN is exactly the ingredient that turns a mistake into a real send.
  envDir: join(ROOT, "scripts"),
  // Nothing here is served to a browser, so there is nothing to pre-bundle.
  // Without this the dependency scanner starts on index.html and is still
  // running when the server closes, which prints a stack trace about a
  // cancelled scan on top of an otherwise clean result.
  optimizeDeps: { noDiscovery: true, include: [] },
});

let sentryModule;
let observability;
let client;
try {
  sentryModule = await server.ssrLoadModule("/src/lib/sentry.ts");
  observability = await server.ssrLoadModule("/src/lib/observability.ts");
  client = await server.ssrLoadModule("/src/api/client.ts");
  const Sentry = await import("@sentry/react");

  // -------------------------------------------------------------------------
  // No DSN starts nothing. First, before any client exists.
  // -------------------------------------------------------------------------

  if (sentryModule.initSentry() !== false || Sentry.getClient() !== undefined) {
    fail(
      "initSentry() started a client with no DSN configured.",
      "      Local development, the render check and anybody building this repository",
      "      without a Sentry project of their own all run with no DSN, and none of",
      "      them should be reporting anything anywhere.",
    );
  }

  // -------------------------------------------------------------------------
  // The fixtures, through a client configured the way the quickstart leaves it.
  //
  // This runs first so that whatever global instrumentation the SDK installs is
  // installed by the permissive client. The real configuration then has to hold
  // with the console already being listened to, which is the harder case and
  // the one worth asserting.
  // -------------------------------------------------------------------------

  const leaked = await collect(Sentry, (transport) => {
    Sentry.init({
      dsn: "https://key@o0.ingest.de.sentry.io/1",
      transport,
      // Nothing else. This is the quickstart: `dataCollection` commented out,
      // no beforeSend, no beforeBreadcrumb.
    });
  });

  for (const [secret, channel] of SECRETS) {
    if (leaked.includes(secret)) continue;
    fail(
      `This check can no longer detect ${channel}.`,
      "      The fixture did not reach the transport even with every guard removed,",
      "      which means the channel moved or the SDK stopped collecting it. Until",
      "      the fixture leaks again, the real case below is asserting silence it",
      "      would have got for free.",
    );
  }

  // -------------------------------------------------------------------------
  // The same fixtures, through the application's own configuration.
  // -------------------------------------------------------------------------

  const sent = await collect(Sentry, (transport) => {
    sentryModule.initSentry({ dsn: "https://key@o0.ingest.de.sentry.io/1", transport });
  });

  for (const [secret, channel] of SECRETS) {
    if (!sent.includes(secret)) continue;
    fail(
      `An error report carried ${channel}.`,
      `      Found ${JSON.stringify(secret)} in what the transport was given.`,
      "      This application holds national identity numbers, passwords and live",
      "      invitation tokens. None of them may reach a third party in a crash report.",
    );
  }

  // The half that must survive. A report nobody can tie back to a request is a
  // report that costs more to act on than it saves.
  if (!sent.includes("req-that-failed")) {
    fail(
      "The report did not carry the request id of the failure that caused it.",
      "      `errorReference` prefers an ApiError's own id over the last one seen, and",
      "      the backend tags its event with the same id — that pairing is the whole",
      "      reason a support call with one number can be answered at all.",
    );
  }
  if (!sent.includes("component_stack")) {
    fail(
      "The report did not carry the component stack.",
      "      It is names of components and nothing else, and it is what says which",
      "      screen broke. Scrubbing is supposed to remove data, not context.",
    );
  }
  // Scrubbing is supposed to remove data, not context. The header allow-list
  // keeps the user agent — this product runs on whatever phone the technician
  // owns — and drops the referrer, which is the previous URL. Conditional on
  // the permissive case having carried one at all, so a Node release that stops
  // reporting a user agent reads as a changed fixture rather than a regression.
  if (leaked.includes("User-Agent") && !sent.includes("User-Agent")) {
    fail(
      "The report no longer carries the user agent.",
      "      It is not user-entered data and it is often the whole diagnosis. The",
      "      header that must not survive is Referer, and it does not.",
    );
  }
  if (sent.includes("Referer")) {
    fail(
      "The report carried a Referer header.",
      "      It is the URL of the previous page, which is how the token in a",
      "      password-reset link follows somebody onto the next screen.",
    );
  }

  if (sent.includes('"category":"console"')) {
    fail(
      "A console breadcrumb reached the transport.",
      "      Console lines carry whatever anybody ever logged, from this codebase and",
      "      from every dependency. They are dropped whole rather than scrubbed,",
      "      because a denylist can only redact the shapes it recognises.",
    );
  }

  // -------------------------------------------------------------------------
  // The options themselves. The tripwire, named flag by named flag.
  // -------------------------------------------------------------------------

  const options = Sentry.getClient()?.getOptions() ?? {};
  const collection = options.dataCollection;

  if (!collection) {
    fail(
      "initSentry no longer passes `dataCollection` at all.",
      "      With the option absent the SDK falls back to the sendDefaultPii bridge and",
      "      its own defaults. Every category has to be named.",
    );
  } else {
    // An omitted key is not neutral: the SDK applies its documented default to
    // it, and the default is `true` for cookies, headers, bodies and query
    // parameters. So each one is required to be present, by name.
    const required = {
      userInfo: false,
      cookies: false,
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    };
    for (const [key, expected] of Object.entries(required)) {
      if (collection[key] === expected) continue;
      fail(
        `dataCollection.${key} is ${JSON.stringify(collection[key])}, expected ${expected}.`,
        "      Collection was turned off deliberately on an application holding national",
        "      identity numbers, passwords and invitation tokens. Turning it back on is a",
        "      decision that needs making on purpose, not in passing.",
      );
    }
    if (!Array.isArray(collection.httpBodies) || collection.httpBodies.length > 0) {
      fail(
        `dataCollection.httpBodies is ${JSON.stringify(collection.httpBodies)}, expected [].`,
        "      It is a list of body types to collect; an empty list is the way to say none,",
        "      and an omitted one collects every type valid for the platform.",
      );
    }
    for (const [group, keys] of [
      ["httpHeaders", ["request", "response"]],
      ["graphQL", ["document", "variables"]],
      ["genAI", ["inputs", "outputs"]],
    ]) {
      for (const key of keys) {
        if (collection[group]?.[key] === false) continue;
        fail(
          `dataCollection.${group}.${key} is ${JSON.stringify(collection[group]?.[key])}, expected false.`,
        );
      }
    }
  }

  if (options.sendDefaultPii !== false) {
    fail(
      `sendDefaultPii is ${JSON.stringify(options.sendDefaultPii)}, expected false.`,
      "      Superseded by dataCollection and kept anyway: integrations that read the old",
      "      flag directly go on reading it.",
    );
  }

  if (options.tracesSampleRate) {
    fail(
      `tracesSampleRate is ${options.tracesSampleRate}, expected 0 or absent.`,
      "      Tracing attaches URLs and payload metadata to spans, which is a separate",
      "      collection surface from the one this check covers.",
    );
  }

  const enabled = (options.integrations ?? []).map((integration) => integration.name);
  for (const forbidden of ["Replay", "ReplayCanvas", "Feedback"]) {
    if (!enabled.includes(forbidden)) continue;
    fail(
      `The ${forbidden} integration is enabled.`,
      "      Session replay records the screen, which on this product means recording",
      "      somebody typing an identity number into a form. Enabling it is a decision",
      "      about that, not about observability.",
    );
  }
} finally {
  await server.close();
}

// ---------------------------------------------------------------------------
// The SDK must stay out of the SSR render.
//
// scripts/smoke-render.mjs renders every route under Node. A browser SDK
// imported anywhere in that module graph reaches for `window` while the module
// is being evaluated and takes the render check down with it — which surfaces
// as an unrelated-looking crash in a script about screens. This says so
// directly instead.
// ---------------------------------------------------------------------------

const SDK_HOME = "src/lib/sentry.ts";
const SDK_ENTRY = "src/main.tsx";
const SDK_IMPORT = /from\s+["']@sentry\//;
const HOME_IMPORT = /from\s+["'](?:@\/lib\/sentry|\.\/sentry|\.\.\/lib\/sentry)["']/;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files.sort();
}

let homeImportsSdk = false;
let entryImportsHome = false;

for (const file of walk(SRC)) {
  const path = relative(ROOT, file);
  const source = readFileSync(file, "utf8");

  // A type-only import is erased at compile time and never reaches the module
  // graph, so `import type { Event } from "@sentry/react"` is allowed anywhere:
  // it costs nothing at runtime and it is how the policy module stays typed
  // against the shapes it is scrubbing.
  const runtimeSdkImports = source
    .split("\n")
    .filter((line) => SDK_IMPORT.test(line) && !/^\s*import\s+type\s/.test(line));

  if (runtimeSdkImports.length > 0) {
    if (path === SDK_HOME) homeImportsSdk = true;
    else {
      fail(
        `${path} imports the Sentry SDK.`,
        `      Only ${SDK_HOME} may, and only ${SDK_ENTRY} may import that. Everything`,
        "      else goes through @/lib/observability, which imports no SDK and can",
        "      therefore be rendered under Node by the smoke test.",
      );
    }
  }

  if (HOME_IMPORT.test(source)) {
    if (path === SDK_ENTRY) entryImportsHome = true;
    else {
      fail(
        `${path} imports ${SDK_HOME}.`,
        `      Only ${SDK_ENTRY} may: it is the one module scripts/smoke-render.mjs`,
        "      never loads. Report an error through `reportError` in",
        "      @/lib/observability instead.",
      );
    }
  }
}

// The rule must also still be describing something that exists.
if (!homeImportsSdk) {
  fail(
    `${SDK_HOME} no longer imports the Sentry SDK.`,
    "      Either it moved, in which case update SDK_HOME, or reporting was removed.",
    "      Either way this rule is now guarding nothing.",
  );
}
if (!entryImportsHome) {
  fail(
    `${SDK_ENTRY} no longer imports ${SDK_HOME}, so nothing ever calls initSentry.`,
    "      Reporting is off and every screen that breaks does so in silence.",
  );
}

// ---------------------------------------------------------------------------

if (problems.length > 0) {
  console.error("Sentry would report more than it should:\n");
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}

console.log(
  `Nothing sensitive leaves in a crash report — ${SECRETS.length} secrets planted in ` +
    "the URL, the referrer, the console and a search query, all four proven to leak " +
    "through an unconfigured client and none of them through this one — OK",
);
process.exit(0);

/**
 * Builds a client, plants every fixture, reports a failure through the path the
 * error boundary uses, and returns what the transport was handed.
 */
async function collect(Sentry, init) {
  // Cleared rather than carried over, so each case reports what it collected
  // itself. Breadcrumbs live on the scope and outlive a client, and a case that
  // inherited the previous one's would be asserting something about the order
  // these run in rather than about the configuration under test.
  Sentry.getCurrentScope().clear();
  Sentry.getIsolationScope().clear();
  Sentry.getGlobalScope().clear();
  client.__resetClient();
  observability.__resetObservability();

  const envelopes = [];
  init(() => ({
    send: async (envelope) => {
      envelopes.push(envelope);
      return {};
    },
    flush: async () => true,
  }));

  // A console line carrying a form payload, as a debugging session leaves
  // behind. It has to go through the real `console.log` to be instrumented, so
  // it also reaches the terminal — hence the label. None of these are real.
  console.log("[fixture, invented values] submitting", {
    national_id: NATIONAL_ID,
    password: PASSWORD,
  });

  // A real request through the real client, with a search term of exactly the
  // kind people type into this product's search boxes.
  nextResponse = () =>
    new Response(JSON.stringify({ results: [], pagination: { total: 0 } }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-ID": "req-that-succeeded" },
    });
  await client.api.get("/customers", { query: { search: NATIONAL_ID } }).catch(() => undefined);

  // And one that fails, so an ApiError with the server's own id exists.
  nextResponse = () =>
    new Response(
      JSON.stringify({ error: { code: "INTERNAL_ERROR", request_id: "req-that-failed" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  const apiError = await client.api.get("/customers").then(
    () => null,
    (error) => error,
  );

  // A later success moves the "last seen" id on, so the assertion that the
  // report carries `req-that-failed` is an assertion about the error's own id
  // rather than about whatever happened to be most recent.
  nextResponse = () =>
    new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-ID": "req-after-the-failure" },
    });
  await client.api.get("/customers").catch(() => undefined);

  Sentry.getCurrentScope().setExtra("payload", {
    national_id: NATIONAL_ID,
    password: PASSWORD,
  });

  // The path an error boundary takes, and then the path an unhandled error
  // takes. Exactly one event comes out of the two: the quickstart client has no
  // reporter registered so only the second does anything, and under the real
  // one the second is dropped by the Dedupe integration as a repeat of the
  // first. Both are here because both are real paths and neither should be the
  // only one covered.
  observability.reportError(apiError, {
    boundary: "screen",
    componentStack: "\n    at CustomerFormScreen\n    at ScreenBoundary",
  });
  Sentry.captureException(apiError);

  await Sentry.flush(2000);
  return JSON.stringify(envelopes);
}
