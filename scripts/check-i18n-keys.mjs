#!/usr/bin/env node
/**
 * Cross-checks translation keys against messages/tr.json.
 *
 * A missing key is a silent failure: i18next renders the key path itself, so
 * the UI shows "elevator.fields.brnd" instead of a label and nothing throws.
 * Unused keys are reported as a warning only — they are untidy, not broken.
 *
 * Enum namespaces are deliberately exempt from the unused check: values arrive
 * from the API at runtime, so `elevator.category.*` has no literal call site.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const MESSAGES = join(ROOT, "messages/tr.json");

const messages = JSON.parse(readFileSync(MESSAGES, "utf8"));

function flatten(node, prefix = "") {
  const keys = new Set();
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      for (const nested of flatten(value, path)) keys.add(nested);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

const defined = flatten(messages);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

const used = new Map();
// t("a.b"), labelKey: "a.b", titleKey="a.b" — all resolve through i18next.
const KEY_PATTERN = /(?:\bt\(|labelKey[:=]\s*|titleKey[:=]\s*|badgeKey[:=]\s*)["'`]([a-zA-Z][\w.]*\.[\w.]+)["'`]/g;

for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(KEY_PATTERN)) {
    const key = match[1];
    if (!used.has(key)) used.set(key, relative(ROOT, file));
  }
}

const missing = [...used].filter(([key]) => !defined.has(key));

// Namespaces resolved at runtime from API enum values.
const RUNTIME_NAMESPACES = [
  "elevator.status",
  "elevator.category",
  "elevator.driveType",
  "elevator.controlType",
  "elevator.doorType",
  "elevator.machineRoom",
  "elevator.inspectionLabel",
  "contract.status",
  "contract.scope",
  "contract.pricingType",
  "contract.billingPeriod",
  "customer.type",
  "customerContact.role",
  "building.type",
  "user.role",
  "attachment.category",
  "address.type",
  "errors",
];

const unused = [...defined].filter(
  (key) => !used.has(key) && !RUNTIME_NAMESPACES.some((ns) => key.startsWith(`${ns}.`)),
);

if (missing.length > 0) {
  console.error(`Missing translation keys (${missing.length}):\n`);
  for (const [key, file] of missing) console.error(`  ${key}   ${file}`);
  process.exit(1);
}

console.log(`All ${used.size} referenced keys exist in messages/tr.json`);
if (unused.length > 0) {
  console.warn(`\nWarning: ${unused.length} defined keys are never referenced:`);
  for (const key of unused) console.warn(`  ${key}`);
}
