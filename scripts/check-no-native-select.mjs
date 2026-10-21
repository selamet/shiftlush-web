#!/usr/bin/env node
/**
 * Fails on any native `<select>` in src/.
 *
 * Every choice in the product is made with the searchable picker
 * (src/components/ui/searchable-select.tsx): it searches as people here type —
 * "cayir" finds "Çayır" — it is a full-size target on a phone instead of the
 * platform's thin popup, and it submits through a hidden input so the
 * uncontrolled forms read it exactly as they read a select. A native select
 * added later quietly brings back the list nobody can search, so this check
 * exists to make that a decision rather than an accident.
 *
 * The allowlist is explicit and every entry needs its reason. It is empty: no
 * screen currently needs the native control.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/** path relative to the repo → why the native control must stay there. */
const ALLOWLIST = {};

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(tsx|ts|jsx|js)$/.test(entry)) files.push(full);
  }
  return files;
}

const OPENING = /<select[\s>/]/;
const found = [];
let scanned = 0;
for (const file of walk(SRC)) {
  scanned += 1;
  const path = relative(ROOT, file);
  if (path in ALLOWLIST) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      // A JSX element, not the word in a comment or a string about selects.
      const code = line.replace(/\/\/.*$/, "");
      if (OPENING.test(code) && !/^\s*\*/.test(line)) found.push(`${path}:${index + 1}  ${line.trim()}`);
    });
}

if (scanned === 0) {
  console.error("No source files were scanned — the check would pass having checked nothing.");
  process.exit(1);
}

for (const path of Object.keys(ALLOWLIST)) {
  if (!readFileSync(join(ROOT, path), "utf8").match(OPENING)) {
    console.error(`Allowlist entry ${path} no longer has a native <select>; remove it from the list.`);
    process.exit(1);
  }
}

if (found.length > 0) {
  console.error(`Native <select> found in src/ (${found.length}). Use SearchableSelect instead:\n`);
  for (const line of found) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`No native <select> in src/ — ${scanned} files checked — OK`);
