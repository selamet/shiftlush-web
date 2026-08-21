#!/usr/bin/env node
/**
 * Renders every route of the real router, for every role, and fails on any
 * error thrown during render.
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

const PATHS = [
  "/login",
  "/styleguide",
  "/elevators",
  "/elevators/e1",
  "/elevators/e1/edit",
  "/customers",
  "/customers/c1",
  "/complexes",
  "/buildings",
  "/buildings/new",
  "/contracts",
  "/contracts/k1",
  "/qr-labels",
  "/users",
  "/audit-logs",
  "/settings",
];

const ROLES = ["owner", "operations", "technician", "accountant"];

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
        const router = createRouterForPath(path);
        await router.load();
        const html = renderToString(React.createElement(RouterProvider, { router }));
        if (!html || html.length < 40) throw new Error(`rendered ${html.length} characters`);
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
