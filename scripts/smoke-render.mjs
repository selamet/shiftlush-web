#!/usr/bin/env node
/**
 * Renders every route of the real router, for every role, and fails on any
 * error thrown during render.
 *
 * The role is passed into the router, which hands the shell a session without
 * calling the server. That matters: sidebars, table columns and whole sections
 * are hidden per role, so rendering one role four times — which is what this
 * did before the role was threaded through — tested a quarter of what it
 * claimed to.
 *
 * The build only proves the code type-checks and bundles. This proves the app
 * actually renders and that every route in the tree resolves — including the
 * ones you can only get to by clicking a link, which is exactly where dead
 * screens hide.
 *
 * Browser globals the app touches are stubbed; that is the only concession to
 * running outside a browser.
 */
import { createServer } from "vite";
import { installMockApi, requested } from "./mock-api.mjs";
import { renderToString } from "react-dom/server";
import React from "react";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.document = {
  documentElement: { classList: { toggle() {} } },
  getElementById: () => null,
};
globalThis.window = globalThis;
globalThis.scrollTo = () => {};

// Route loaders warm the query cache before the render, so screens see real
// content instead of a page of skeletons — and they see it through the real
// request path rather than a direct fixture import.
installMockApi();

const PATHS = [
  "/login",
  "/register",
  "/password-reset",
  "/password-reset/some-token",
  // The three the e-mails point at. Before these existed an invitation arrived,
  // the person clicked, and the product answered with a 404.
  "/verify-email/some-token",
  "/invitation/some-token",
  "/styleguide",
  "/elevators",
  "/elevators/e1",
  "/elevators/new",
  "/elevators/e1/edit",
  "/customers",
  "/customers/new",
  "/customers/c1",
  "/customers/c1/edit",
  "/customers/c1/contacts/new",
  "/customers/c1/contacts/c1-contact-1",
  "/customers/c6/edit",
  "/complexes",
  "/complexes/new",
  "/complexes/s1",
  "/complexes/s1/edit",
  "/complexes/s4",
  "/buildings",
  "/buildings/new",
  "/buildings/b1/edit",
  "/contracts",
  "/contracts/new",
  "/contracts/k1",
  "/contracts/k1/edit",
  // A contract nobody stated a VAT rate on, and one deliberately at 0%. The
  // server sends null totals for the first and real ones for the second, and
  // the two must not arrive on screen looking alike — see the assertions.
  "/contracts/k-novat",
  "/contracts/k-novat/edit",
  "/contracts/k-zerovat",
  "/qr-labels",
  "/scan",
  // Both halves of the scanned-label route, because they are different screens
  // and only one of them is the happy one. Under Node there is no decoder and
  // no camera, so `/scan` renders the branch a phone without either would get —
  // which is the branch worth asserting: it must still offer a way through.
  "/q/qr-demo-token",
  "/q/qr-unknown-token",
  "/users",
  "/users/invite",
  // Three colleagues on purpose. Each one puts a different set of controls on
  // the page: u1 is the last active owner, u2 is whoever is signed in, and u3
  // is a technician, whose assignment panel is the page every other role does
  // not get. Rendering one of them would leave two branches untested.
  "/users/u1",
  "/users/u2",
  "/users/u3",
  "/audit-logs",
  "/settings",
  // Its own route rather than a tab behind a click, which is what makes it
  // renderable here at all: the password form and the session list are the two
  // controls on this screen that can sign somebody out if they are wrong.
  "/settings/profile",
];

const ROLES = ["owner", "operations", "technician", "accountant"];

/**
 * Text that must appear on a route that fetches its data.
 *
 * "It rendered something" is too weak once screens are query-driven: a page of
 * loading skeletons clears the length check comfortably. These assert that the
 * loader filled the cache and the screen read from it, which is the whole point
 * of prefetching in the route.
 *
 * Add an entry as each screen moves off fixtures.
 */
/**
 * Text that must appear even though the tab holding it is not the one showing.
 *
 * The elevator form keeps every panel mounted and hides the inactive ones,
 * because unmounting an uncontrolled input throws away what was typed in it.
 * That is invisible from the outside — the page looks identical either way —
 * so it is asserted rather than trusted.
 */
const EXPECT_HIDDEN = {
  // Schindler is on the manufacturing tab; the form opens on identity.
  "/elevators/e1/edit": "Schindler",
};

const EXPECT = {
  "/customers": "Çamlıca",
  "/customers/c1": "Çamlıca",
  // The edit form must arrive with the record already in its inputs; an empty
  // form here would mean the loader or the defaultValue wiring is broken.
  "/customers/c1/edit": "Çamlıca",
  // The contact form is reached through the customer, so it has to name the
  // customer; and the edit form has to arrive with the contact in its inputs.
  "/customers/c1/contacts/new": "Çamlıca",
  "/customers/c1/contacts/c1-contact-1": "Ayşe Demir",
  // An individual customer, so the half of the form only they see is actually
  // rendered rather than only type-checked. The label is the tell: a TC field
  // where an organisation would show a tax office.
  "/customers/c6/edit": "TC kimlik no",
  // The invitation must name who is inviting; a link asking for a password
  // without saying who sent it is indistinguishable from phishing.
  "/invitation/some-token": "Yükseliş",
  // Node has no BarcodeDetector and no camera, so this renders exactly what a
  // phone without either would get. Both halves are asserted: the screen must
  // say why there is no camera *and* still put a way through on the page. A
  // scanner that renders only an apology is the dead end this replaced.
  "/scan": ["Bu telefon QR okuyamıyor", "Kimlik numarasıyla bul"],
  // A resolved label names the lift before the thirty-one-field record lands.
  // Asserting the number as well as the name catches the narrowed `by-qr`
  // response being read as though it were the full one.
  "/q/qr-demo-token": ["Sol asansör", "34-2019-004512"],
  // The half that matters. Every token but one is a 404 from the mock, which is
  // what the server answers for an unknown label and for another firm's alike —
  // and the screen has to turn that into something a person can act on rather
  // than into a raw error.
  "/q/qr-unknown-token": ["Bu QR bir asansöre çözümlenmedi", "Kimlik numarasıyla bul"],
  "/buildings": "Blok",
  "/complexes": "Çamlıca Konakları",
  // The blocks inside the estate, not the estate's own name: this asserts the
  // related list came back from the server's `complex` filter rather than the
  // card falling through to its empty state.
  "/complexes/s1": "Blok",
  "/complexes/s1/edit": "Çamlıca Konakları",
  // An empty complex, which is the only kind that may be deleted. s1 has
  // blocks in it and renders the refusal instead, so without this the
  // button is never rendered by anything.
  "/complexes/s4": "Sil",
  // A line closed in June is still part of this contract, and the count says so
  // whether or not the closed rows are expanded. Asserted for every role,
  // because the two tables on this screen — the technical register and the
  // billing ledger — are different components and each states it separately.
  "/contracts/k1": "1 kapatılmış satır",
  // The null totals have to arrive as a sentence, not as an empty cell. Both
  // halves are asserted: the reason in place of each amount, and the heading of
  // the notice that says what to do about it. Asserted for every role, because
  // the alert's body differs by whether the reader may edit the contract while
  // the fact it reports does not.
  "/contracts/k-novat": ["Hesaplanamıyor (KDV oranı girilmemiş)", "Aylık toplam hesaplanamıyor"],
  // The edit form must describe the record in front of the user rather than
  // repeat the old permanent warning, which said the same thing on every
  // contract whether or not it had a rate.
  "/contracts/k-novat/edit": "Bir oran girip kaydedin",
  // And the other half of the distinction: a contract settled at 0% shows its
  // rate and its totals like any other, marked as a decision rather than a gap.
  // If this ever renders the "unstated" sentence the two states have collapsed
  // into one, which is the failure the server added `vat_status` to prevent.
  "/contracts/k-zerovat": ["KDV uygulanmıyor", "1.800,00"],
  // The edit form must arrive with the record in its inputs, on the tab that
  // is showing and on the ones that are not.
  "/elevators/e1/edit": "34-2019",
  "/elevators": "34-2018",
  "/elevators/e1": "34-2019",
  // Two independent sections on one screen: the colleagues table, and the
  // pending invitations underneath it.
  "/users": ["Hakan Çelik", "nur.aydin@yukselisasansor.com", "Süresi doldu"],
  // The reason takes the place of the control it replaces, so asserting the
  // sentence is asserting that the screen explained itself rather than simply
  // rendering nothing where a button used to be.
  "/users/u1": ["Mehmet Yılmaz", "Firmanın tek aktif sahibi pasifleştirilemez."],
  "/users/u2": ["Ayşe Demir", "Kendinizi pasifleştiremezsiniz."],
  // The assignment panel is the reason a technician has a page at all, and a
  // customer name proves it rendered its list rather than a loading line.
  "/users/u3": ["Hakan Çelik", "Çamlıca", "Atanmış müşteriler", "Pasifleştir"],
  // The company record has to arrive in the inputs, and for every role: the
  // four differ only in whether the fields can be written. A screen that filled
  // the form for the owner and left it empty for everybody else would pass a
  // check that only looked at one of them.
  "/settings": ["Yükseliş Asansör Bakım ve Servis Ltd. Şti.", "Barbaros Bulvarı"],
  // Three independent things on the profile tab, so three assertions. The
  // password form has to be a form and not the sentence it replaced; the
  // session list has to have read the three rows the mock serves — the device
  // label is the tell, because it is derived from the user-agent header rather
  // than copied out of the response; and exactly one row has to be marked as
  // this one.
  "/settings/profile": [
    "Mevcut şifreniz",
    "Chrome · macOS",
    "Safari · iOS",
    "Edge · Windows",
    "Bu cihaz",
  ],
};

/**
 * Text that must NOT appear.
 *
 * The user screens withhold the controls the server would refuse: nobody may
 * deactivate themselves, and nobody may deactivate the last active owner. A
 * render check cannot catch a regression that puts either button back — only
 * its absence can, and the absence is the whole safety property.
 */
const EXPECT_ABSENT = {
  "/users/u1": "Pasifleştir",
  "/users/u2": "Pasifleştir",
  // A contract at 0% is settled, not unfinished. The moment this sentence
  // appears on it, the two VAT states have collapsed into one and a rate
  // somebody agreed reads as a rate somebody forgot.
  "/contracts/k-zerovat": "Hesaplanamıyor",
  // A session list says which devices someone carries and, through the address
  // it was last used from, roughly where they were when they did. The address
  // is on the record the screen already holds — the mock serves it, because the
  // contract does — and the screen must not print it. An absence is the only
  // way to check that, and it is the whole of what was decided here.
  "/settings/profile": ["88.230.14.7", "185.66.120.44", "AppleWebKit"],
};

const server = await createServer({
  // No HMR: this renders each route once and exits. The websocket server it
  // would otherwise open is a listening socket nobody connects to.
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
});

let failures = 0;
try {
  await server.ssrLoadModule("/src/lib/i18n.ts");
  // Everything comes from the app's own module graph: importing the router
  // package separately creates a second instance and React context stops
  // matching, which looks like a render bug but is a module-identity bug.
  const { createRouterForPath, RouterProvider } = await server.ssrLoadModule("/src/router.tsx");

  for (const path of PATHS) {
    const errors = [];
    for (const role of ROLES) {
      try {
        const router = createRouterForPath(path, role);
        await router.load();
        const html = renderToString(React.createElement(RouterProvider, { router }));
        if (!html || html.length < 40) throw new Error(`rendered ${html.length} characters`);

        // One string or several. A screen assembled from two independent
        // sections needs an assertion per section, or half of it can stop
        // rendering without the check noticing.
        for (const needle of [EXPECT[path] ?? []].flat()) {
          if (!html.includes(needle)) {
            throw new Error(`data never reached the page — no "${needle}" in the markup`);
          }
        }

        for (const needle of [EXPECT_ABSENT[path] ?? []].flat()) {
          if (html.includes(needle)) {
            throw new Error(
              `"${needle}" is on a page that must not offer it — the server refuses ` +
                `this action, so the interface must not present it.`,
            );
          }
        }

        const hidden = EXPECT_HIDDEN[path];
        if (hidden && !html.includes(hidden)) {
          throw new Error(
            `a field on a hidden tab is not in the form — no "${hidden}" in the markup. ` +
              `Unmounting inactive panels loses whatever was typed on them.`,
          );
        }
      } catch (error) {
        errors.push(`${role}: ${error.message}`);
      }
    }
    if (errors.length === 0) {
      console.log(`  OK    ${path}`);
    } else {
      failures += errors.length;
      console.error(`  FAIL  ${path}`);
      for (const message of errors) console.error(`          ${message}`);
    }
  }
  // The guard, checked as an anonymous visitor rather than through the
  // override every other case uses. Without it a signed-out person lands
  // inside the application and its loaders start making calls that can only
  // 401 — which is what filled a production network panel with red.
  // Asserted on the requests rather than on the resulting location, because
  // `router.load()` does not apply a redirect thrown in beforeLoad — the
  // existing `/` to `/elevators` redirect does not take effect here either.
  // What it does prove is the thing that was actually wrong: the loader never
  // runs, so a signed-out visitor makes no request that can only 401.
  requested.length = 0;
  const guarded = createRouterForPath("/elevators");
  await guarded.load();
  const askedFor = requested.filter((path) => path.startsWith("/api/v1/elevators"));

  if (askedFor.length > 0) {
    console.error(`  FAIL  anonymous visitor requested ${askedFor[0]}`);
    console.error("          The guard must run before the loaders, not in the component.");
    failures += 1;
  } else if (!requested.includes("/api/v1/auth/refresh")) {
    console.error("  FAIL  the session was never checked — the guard did not run at all");
    failures += 1;
  } else {
    console.log("  OK    anonymous visitor asks only whether they have a session");
  }
} finally {
  await server.close();
}

if (failures > 0) {
  console.error(`\n${failures} render failure(s)`);
} else {
  console.log(`\nAll ${PATHS.length} routes render across ${ROLES.length} roles`);
}

/*
 * Exit rather than let the event loop drain.
 *
 * Rendering the routes takes about a second. Waiting for Node to decide it has
 * nothing left to do took five minutes, which was most of the CI run and all of
 * the reason a one-line change took six minutes to verify.
 *
 * The cause is the query cache: `gcTime` defaults to five minutes, so every
 * query the loaders populate schedules a collection timer that far out, and a
 * pending timer keeps the process alive. There were twenty-four of them.
 *
 * They could be cleared by giving the smoke run its own client, but that would
 * mean rendering against a cache configured differently from the real one --
 * and this script exists to render the real thing. So the verdict is printed
 * and the process ends, which is what a one-shot checker should do anyway.
 */
process.exit(failures > 0 ? 1 : 0);
