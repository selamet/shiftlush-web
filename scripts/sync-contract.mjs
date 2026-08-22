#!/usr/bin/env node
/**
 * Pull the published contract into this repository and regenerate the types.
 *
 * Section 14.1 had this running the other way: `make sync-spec` in the API
 * repository copied the spec sideways into a sibling working copy. That shape
 * is why drift was possible at all — it required the two repositories to be
 * cloned next to each other, it ran on somebody's laptop, and skipping it left
 * no trace. Nothing downstream could tell the difference between "synced" and
 * "never ran".
 *
 * Pulling instead means the repository that needs the contract fetches it, from
 * the same published source `check-contract-fresh.mjs` verifies against, in the
 * repository the red build is telling to run it. No side-by-side clone, no
 * running backend, one command.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import {
  CONTRACT_SOURCE,
  fetchPublishedContract,
  sha256,
} from "./check-contract-fresh.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const LOCAL_SPEC = join(ROOT, "openapi/v1.yaml");

console.log(`Reading the published contract from ${CONTRACT_SOURCE}`);

// Exits non-zero on anything it cannot read or validate, so there is no way to
// land an empty or truncated spec here.
const published = await fetchPublishedContract();

const before = existsSync(LOCAL_SPEC) ? readFileSync(LOCAL_SPEC, "utf8") : null;

if (before === published.text) {
  console.log(`Already current — sha256 ${sha256(published.text)}`);
} else {
  writeFileSync(LOCAL_SPEC, published.text);
  console.log(`Wrote openapi/v1.yaml — sha256 ${sha256(published.text)}`);
  if (before !== null) {
    console.log(`  was            sha256 ${sha256(before)}`);
  }
}

console.log("Regenerating src/api/generated.ts");
execFileSync("npm", ["run", "--silent", "api:generate"], { cwd: ROOT, stdio: "inherit" });

console.log("");
console.log("Commit openapi/v1.yaml and src/api/generated.ts together — CI");
console.log("regenerates the types and diffs them against what you committed.");
