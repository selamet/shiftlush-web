#!/usr/bin/env node
/**
 * Every error code the API can return must have a Turkish sentence here.
 *
 * This is the drift that hurts. The backend deliberately sends codes and no
 * prose, so a code with no entry in messages/tr.json reaches the user as an
 * empty toast or a raw SCREAMING_SNAKE_CASE string — for an error that, by
 * definition, someone has just hit and cannot now describe in a bug report.
 *
 * The list of codes is read from the contract rather than kept in step by hand,
 * so adding a code on the backend fails this check on the very next sync.
 *
 * Client-only codes (a dropped connection, an aborted request) are allowed to
 * exist here without appearing in the contract: the server never sends them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SPEC = join(ROOT, "openapi/v1.yaml");
const MESSAGES = join(ROOT, "messages/tr.json");

/** Codes the client raises itself; the API has no way to send them. */
const CLIENT_ONLY = new Set(["NETWORK_ERROR", "UNKNOWN_ERROR"]);

/**
 * Pulls the ErrorCode enum out of the contract without a YAML parser.
 *
 * A dependency for one block of a file we control the shape of is not worth
 * the install; the block is generated from a Python enum and always has the
 * same form.
 */
function codesFromSpec(text) {
  const start = text.indexOf("\n    ErrorCode:\n");
  if (start === -1) {
    throw new Error("No ErrorCode schema in openapi/v1.yaml. Did the contract sync run?");
  }
  const body = text.slice(start);
  const enumStart = body.indexOf("enum:");
  if (enumStart === -1) throw new Error("ErrorCode schema has no enum block.");

  const codes = [];
  for (const line of body.slice(enumStart).split("\n").slice(1)) {
    const match = /^\s+- ([A-Z][A-Z0-9_]*)\s*$/.exec(line);
    if (!match) break;
    codes.push(match[1]);
  }
  if (codes.length === 0) throw new Error("ErrorCode enum parsed as empty.");
  return codes;
}

const codes = codesFromSpec(readFileSync(SPEC, "utf8"));
const translated = JSON.parse(readFileSync(MESSAGES, "utf8")).errors ?? {};

const missing = codes.filter((code) => !translated[code]);
// Only SCREAMING_SNAKE keys are codes. The same namespace also holds the two
// labels shown next to an error, and those have no business in this comparison.
const stale = Object.keys(translated).filter(
  (key) => /^[A-Z][A-Z0-9_]*$/.test(key) && !codes.includes(key) && !CLIENT_ONLY.has(key),
);

if (missing.length > 0) {
  console.error(`Error codes with no Turkish message (${missing.length}):`);
  for (const code of missing) console.error(`  ${code}`);
}

if (stale.length > 0) {
  // A warning, not a failure: a message for a code the server no longer sends
  // is dead weight, but it breaks nothing and removing it is a separate act
  // from adding the ones that are missing.
  console.warn(`\nMessages for codes the API no longer returns (${stale.length}):`);
  for (const code of stale) console.warn(`  ${code}`);
}

if (missing.length > 0) process.exit(1);

console.log(`${codes.length} error codes, all translated.`);
