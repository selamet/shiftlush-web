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
  "/qr-labels",
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
