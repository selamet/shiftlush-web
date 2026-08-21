#!/usr/bin/env node
/**
 * Renders every screen once and fails on any error thrown during render.
 *
 * The build only proves the code type-checks and bundles. This proves each
 * screen actually renders: bad hook order, reading a field off a null fixture,
 * a component used before it is defined. Runs through Vite's SSR pipeline so
 * the real aliases, JSON imports and TSX transform are used.
 *
 * Browser globals the app touches at module or render time are stubbed —
 * that is the only concession to running outside a browser.
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

const SCREENS = [
  ["LoginScreen", "/src/screens/LoginScreen.tsx"],
  ["ElevatorListScreen", "/src/screens/ElevatorListScreen.tsx"],
  ["ElevatorFormScreen", "/src/screens/ElevatorFormScreen.tsx"],
  ["ElevatorDetailScreen", "/src/screens/ElevatorDetailScreen.tsx"],
  ["ContractDetailScreen", "/src/screens/ContractDetailScreen.tsx"],
  ["QrLabelScreen", "/src/screens/QrLabelScreen.tsx"],
  ["AddressPicker", "/src/components/forms/AddressPicker.tsx"],
  ["StyleGuide", "/src/styleguide/StyleGuide.tsx"],
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
  const { SessionProvider } = await server.ssrLoadModule("/src/lib/session.tsx");

  for (const [name, path] of SCREENS) {
    const module = await server.ssrLoadModule(path);
    const Component = module[name];
    if (typeof Component !== "function") {
      console.error(`  FAIL  ${name} — export not found in ${path}`);
      failures += 1;
      continue;
    }

    // Role-scoped screens must render for every role, not just the default:
    // that is where the hidden-field branches live.
    for (const role of ROLES) {
      try {
        const html = renderToString(
          React.createElement(
            SessionProvider,
            { initialRole: role },
            React.createElement(Component),
          ),
        );
        if (!html || html.length < 40) {
          throw new Error(`rendered ${html.length} characters`);
        }
      } catch (error) {
        console.error(`  FAIL  ${name} [${role}] — ${error.message}`);
        failures += 1;
      }
    }
    if (failures === 0) console.log(`  OK    ${name}`);
  }
} finally {
  await server.close();
}

if (failures > 0) {
  console.error(`\n${failures} render failure(s)`);
  process.exit(1);
}
console.log(`\nAll ${SCREENS.length} screens render across ${ROLES.length} roles`);
