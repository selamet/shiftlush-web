#!/usr/bin/env node
/**
 * Every path the client calls must exist in the contract, spelled exactly.
 *
 * This exists because of a bug that reached production. Django appends a
 * trailing slash to router URLs and answers a slashless request with a 301.
 * A browser following a redirected POST turns it into a GET — so a create
 * silently became a read, the body was dropped, and the response was a 200
 * carrying a list. Nothing threw. TypeScript was happy, the build was green,
 * and the only symptom was that saving a record did nothing.
 *
 * The auth endpoints have no trailing slash and the router endpoints do. That
 * asymmetry is real, it is what the server serves, and it is exactly the kind
 * of detail nobody can hold in their head across eleven call sites.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SPEC = join(ROOT, "openapi/v1.yaml");
const SRC = join(ROOT, "src");
const PREFIX = "/api/v1";

/** Paths declared by the contract, with `{param}` left in place. */
function contractPaths(text) {
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
  if (paths.size === 0) throw new Error("No paths parsed from openapi/v1.yaml.");
  return paths;
}

function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/**
 * Pulls the path argument out of every `api.get("...")` / `api.post(\`...\`)`.
 * Template interpolations become `{param}` so a detail route matches the
 * contract's own spelling.
 */
function calledPaths(text) {
  const calls = [];
  // The generic is matched as "anything up to the opening paren". A naive
  // `<[^>]*>` stops at the first `>`, which means it never matches a nested
  // generic like `<Paginated<Customer>>` — and this check silently verified
  // nothing at all until that was noticed.
  const pattern = /\bapi\.(get|post|patch|put|delete)\s*(?:<[^(]*>)?\s*\(\s*([`"'])([^`"']+)\2/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    calls.push({ method: match[1], path: match[3].replace(/\$\{[^}]+\}/g, "{param}") });
  }
  return calls;
}

const declared = contractPaths(readFileSync(SPEC, "utf8"));

/** `{id}` and `{param}` are the same shape; compare with names normalised. */
const normalise = (path) => path.replace(/\{[^}]+\}/g, "{}");
const declaredNormalised = new Map();
for (const path of declared) declaredNormalised.set(normalise(path), path);

const problems = [];
for (const file of sourceFiles(SRC)) {
  for (const call of calledPaths(readFileSync(file, "utf8"))) {
    const full = normalise(PREFIX + call.path);
    if (declaredNormalised.has(full)) continue;

    const withSlash = declaredNormalised.get(`${full}/`);
    const withoutSlash = declaredNormalised.get(full.replace(/\/$/, ""));
    const hint = withSlash
      ? ` — the contract has "${withSlash}" (note the trailing slash)`
      : withoutSlash
        ? ` — the contract has "${withoutSlash}" (no trailing slash)`
        : "";

    problems.push(
      `${file.replace(ROOT, "")}: ${call.method.toUpperCase()} ${call.path}${hint}`,
    );
  }
}

if (problems.length > 0) {
  console.error(`Paths the API does not serve (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("\nA slashless router path is answered with a 301, and a redirected");
  console.error("POST becomes a GET: the write is dropped and nothing throws.");
  process.exit(1);
}

console.log("Every API path the client calls exists in the contract.");
