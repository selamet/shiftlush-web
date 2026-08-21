#!/usr/bin/env node
/**
 * Fails when a Turkish character appears anywhere under src/.
 *
 * Every user-facing string lives in messages/tr.json and reaches the UI through
 * t(). A Turkish character inside a .ts/.tsx file means a string was hardcoded,
 * which puts a translation outside the one file that is supposed to own them.
 *
 * messages/ and fixtures/ sit outside src/ precisely so this rule needs no
 * exceptions.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];
for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (TURKISH.test(line)) {
      violations.push(`${relative(ROOT, file)}:${index + 1}  ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error(
    `Turkish characters found in src/ (${violations.length}). Move the text to messages/tr.json and read it with t():\n`,
  );
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log("No Turkish strings in src/ — OK");
