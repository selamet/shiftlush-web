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
import { installMockApi } from "./mock-api.mjs";
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
  "/complexes",
  "/buildings",
  "/buildings/new",
  "/buildings/b1/edit",
  "/contracts",
  "/contracts/k1",
  "/qr-labels",
  "/users",
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
  // The invitation must name who is inviting; a link asking for a password
  // without saying who sent it is indistinguishable from phishing.
  "/invitation/some-token": "Yükseliş",
  "/buildings": "Blok",
  // The edit form must arrive with the record in its inputs, on the tab that
  // is showing and on the ones that are not.
  "/elevators/e1/edit": "34-2019",
  "/elevators": "34-2018",
  "/elevators/e1": "34-2019",
};

const server = await createServer({
  server: { middlewareMode: true },
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

        const expected = EXPECT[path];
        if (expected && !html.includes(expected)) {
          throw new Error(`data never reached the page — no "${expected}" in the markup`);
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
} finally {
  await server.close();
}

if (failures > 0) {
  console.error(`\n${failures} render failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${PATHS.length} routes render across ${ROLES.length} roles`);
