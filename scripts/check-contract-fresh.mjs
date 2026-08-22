#!/usr/bin/env node
/**
 * This repository's copy of the contract must be the one the backend published.
 *
 * The check this replaces compared `openapi/v1.yaml` against `openapi/v1.sha256`
 * — both files in this repository, both written by the same `make sync-spec`
 * command in the other one. The pair could not disagree with itself. It caught a
 * hand-edited spec, and it could never catch the backend moving on without a
 * sync, which is the failure section 14.1 built it for. It did not catch that
 * failure: the two copies had drifted by 214 lines and four `/auth` endpoints
 * while both pipelines were green.
 *
 * One operand has to come from upstream of the copy step. `shiftlush-api` is
 * public, so its `main` copy of the contract is already published — a static
 * file over HTTPS, no token, no clone, no running backend. Section 14.1's
 * critical rule survives intact: `npm run build` still compiles from the copy
 * committed here, and a file on a CDN is not a backend.
 *
 * FAIL CLOSED. Every path out of this script that is not "the digests match" is
 * an exit 1. An unreachable target, an empty body, an HTML error page, a spec
 * that does not parse, a comparison that would compare this file to itself —
 * all failures. A drift check that passes when it could not perform the
 * comparison is the bug it was written to remove.
 */
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const LOCAL_SPEC = join(ROOT, "openapi/v1.yaml");

/**
 * Where the backend publishes the contract. `main` of the API repository is the
 * truth 14.1 names: generated from the code, and its own CI already fails on a
 * stale committed copy, so whatever is on `main` is current by construction.
 *
 * Overridable for working offline against a local checkout — deliberately an
 * environment variable rather than a flag, so it shows up in the command that
 * set it. CI never sets it, and the resolved source is printed on every run.
 */
export const CONTRACT_SOURCE =
  process.env.SHIFTLUSH_CONTRACT_URL ||
  "https://raw.githubusercontent.com/selamet/shiftlush-api/main/openapi/v1.yaml";

const FETCH_TIMEOUT_MS = 20_000;
const FETCH_ATTEMPTS = 3;

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** Fails rather than returns on anything that is not a readable OpenAPI document. */
function assertLooksLikeContract(text, origin) {
  if (text.trim().length === 0) {
    fail(`The published contract at ${origin} is empty.`);
  }
  if (!/^openapi:\s*3\./m.test(text)) {
    // A redirect, a 404 page, a CDN error, a rate-limit body. Any of these
    // hashed cleanly and would have been compared as though it were the spec.
    const firstLine = text.split("\n", 1)[0].slice(0, 120);
    fail(
      `What came back from ${origin} is not an OpenAPI 3 document.`,
      `It starts: ${firstLine}`,
    );
  }
  if (parsePaths(text).size === 0) {
    fail(`The document at ${origin} declares no paths, so it is not the contract.`);
  }
}

/**
 * Reads the published contract. Network errors are retried, because a blip
 * should not paint a good branch red — but the retries run out, and when they
 * do this exits non-zero. There is no path here that returns nothing.
 */
export async function fetchPublishedContract() {
  const isFile =
    CONTRACT_SOURCE.startsWith("file:") || !/^https?:\/\//.test(CONTRACT_SOURCE);

  if (isFile) {
    const path = CONTRACT_SOURCE.startsWith("file:")
      ? new URL(CONTRACT_SOURCE).pathname
      : CONTRACT_SOURCE;

    if (!existsSync(path)) {
      fail(
        `SHIFTLUSH_CONTRACT_URL points at ${path}, which does not exist.`,
        "The contract to compare against is missing, so nothing was verified.",
      );
    }
    // Comparing this repository's spec against itself is exactly the bug being
    // removed. It would pass, always, and prove nothing.
    if (existsSync(LOCAL_SPEC) && realpathSync(path) === realpathSync(LOCAL_SPEC)) {
      fail(
        `SHIFTLUSH_CONTRACT_URL points at this repository's own ${path}.`,
        "That comparison agrees with itself by construction — it is the check",
        "this one replaced. Point it at the API repository's openapi/v1.yaml.",
      );
    }
    const text = readFileSync(path, "utf8");
    assertLooksLikeContract(text, path);
    return { text, origin: path };
  }

  let lastError = "";
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(CONTRACT_SOURCE, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "text/plain, application/yaml, */*" },
      });
      if (!response.ok) {
        lastError = `HTTP ${response.status} ${response.statusText}`;
        // 404 and 403 will not fix themselves; stop paying for retries.
        if (response.status < 500 && response.status !== 429) break;
      } else {
        const text = await response.text();
        assertLooksLikeContract(text, CONTRACT_SOURCE);
        return { text, origin: CONTRACT_SOURCE };
      }
    } catch (error) {
      lastError = error?.message ?? String(error);
    }
    if (attempt < FETCH_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  fail(
    `Could not read the published contract from ${CONTRACT_SOURCE}`,
    `Last error: ${lastError}`,
    "",
    "The comparison target is unreachable, so the contract was NOT verified.",
    "That is a failure and not a pass: a drift check that goes green when it",
    "could not compare is the check this one replaced.",
  );
}

/** Paths declared by the contract, `{param}` left in place. */
export function parsePaths(text) {
  const paths = new Set();
  let inPaths = false;
  for (const line of text.split("\n")) {
    if (/^paths:/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^[a-z]/.test(line)) break; // next top-level key
    const match = /^ {2}(\/\S*):\s*$/.exec(line);
    if (inPaths && match) paths.add(match[1]);
  }
  return paths;
}

/** `get /api/v1/elevators/` and friends, so the report names operations. */
function parseOperations(text) {
  const operations = new Set();
  let inPaths = false;
  let current = null;
  for (const line of text.split("\n")) {
    if (/^paths:/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;
    if (/^[a-z]/.test(line)) break;
    const path = /^ {2}(\/\S*):\s*$/.exec(line);
    if (path) {
      current = path[1];
      continue;
    }
    const verb = /^ {4}(get|put|post|delete|patch|head|options):\s*$/.exec(line);
    if (verb && current) operations.add(`${verb[1].toUpperCase()} ${current}`);
  }
  return operations;
}

function fail(...lines) {
  console.error("");
  for (const line of lines) console.error(line);
  console.error("");
  process.exit(1);
}

const listing = (items, limit = 20) => {
  const shown = items.slice(0, limit).map((item) => `    ${item}`);
  if (items.length > limit) shown.push(`    … and ${items.length - limit} more`);
  return shown.join("\n");
};

async function main() {
  if (!existsSync(LOCAL_SPEC)) {
    fail(
      "openapi/v1.yaml is missing from this repository.",
      "The contract is committed here so the build never needs a running backend.",
      "Run `npm run api:sync` to fetch it.",
    );
  }

  const local = readFileSync(LOCAL_SPEC, "utf8");
  assertLooksLikeContract(local, "openapi/v1.yaml");

  const published = await fetchPublishedContract();

  const localDigest = sha256(local);
  const publishedDigest = sha256(published.text);

  console.log(`Published contract: ${published.origin}`);

  if (localDigest === publishedDigest) {
    console.log(`This repository's openapi/v1.yaml is the published contract.`);
    console.log(`  sha256 ${localDigest}`);
    return;
  }

  const localOperations = parseOperations(local);
  const publishedOperations = parseOperations(published.text);
  const missingHere = [...publishedOperations].filter((op) => !localOperations.has(op)).sort();
  const goneUpstream = [...localOperations].filter((op) => !publishedOperations.has(op)).sort();

  const report = [
    "This repository's contract is NOT the one the backend published.",
    "",
    `  here      sha256 ${localDigest}`,
    `  published sha256 ${publishedDigest}`,
    "",
  ];

  if (missingHere.length > 0) {
    report.push(`The backend serves ${missingHere.length} operation(s) this copy does not describe:`);
    report.push(listing(missingHere));
    report.push("");
  }
  if (goneUpstream.length > 0) {
    report.push(`This copy describes ${goneUpstream.length} operation(s) the backend no longer serves:`);
    report.push(listing(goneUpstream));
    report.push("");
  }
  if (missingHere.length === 0 && goneUpstream.length === 0) {
    report.push("The endpoint lists agree, so the difference is in schemas,");
    report.push("parameters or responses. Run the sync and read the diff.");
    report.push("");
  }

  report.push("Fix it with:");
  report.push("");
  report.push("    npm run api:sync");
  report.push("");
  report.push("then commit openapi/v1.yaml and src/api/generated.ts together.");

  fail(...report);
}

// `sync-contract.mjs` imports the resolver above so the sync and the check can
// never disagree about where the contract lives. Only run the check when this
// file is the one that was invoked.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
