/**
 * The password floor the forms enforce must match the one the contract declares.
 *
 * Without this the two drift silently, and in the direction that looks fine:
 * the server lowers its floor, the form keeps the old one, and a password the
 * API would accept is refused by a `minLength` attribute with no error message
 * anybody can act on. That is not hypothetical — it is what this check was
 * written after.
 *
 * The contract is read as text rather than parsed, matching the other checks in
 * this directory: no YAML dependency for four lines of structure. The parse is
 * verified rather than trusted. Finding no password fields is a failure, and so
 * is an exclusion that excludes nothing — a check whose pattern stops matching
 * reports success forever, which is worse than not having the check.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(root, "openapi", "v1.yaml");
const CONSTANT = join(root, "src", "lib", "password.ts");

/**
 * Schemas whose password field deliberately declares no floor.
 *
 * Sign-in takes whatever the account already has. Applying the current policy
 * there would lock out anyone whose password predates it, and would state the
 * rule in a second place besides.
 *
 * Listed by name so that a new schema carrying a password is checked by
 * default. Silence should mean "checked", never "forgotten".
 */
const NO_POLICY = ["LoginRequest"];

/**
 * Property names that carry the password policy.
 *
 * `new_password` is here because the change-password request spells it that
 * way, and a check that only looked for `password` waved that schema through
 * without a word — the exact silence this file's header calls worse than no
 * check at all. `current_password` is deliberately absent: it is the password
 * the account already has, judged by comparison and not by the policy, and its
 * `minLength: 1` says only that the field may not be empty.
 */
const POLICY_PROPERTY = /^(\s+)(?:new_)?password:\s*$/;

/** Every write-only password property in the contract, by schema. */
function passwordFields(spec) {
  const found = [];
  const lines = spec.split("\n");
  let schema = "(none)";

  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^ {4}(\w+):\s*$/.exec(lines[i]);
    if (heading) schema = heading[1];

    const opening = POLICY_PROPERTY.exec(lines[i]);
    if (!opening) continue;

    // The property's own body: the lines indented further than its key.
    const indent = opening[1].length;
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === "") continue;
      if (line.search(/\S/) <= indent) break;
      body.push(line.trim());
    }

    // `password` also appears as an entry in a `required` list, which has no
    // body of its own. Only the write-only string properties declare a floor.
    if (!body.includes("writeOnly: true")) continue;
    const min = body.find((line) => line.startsWith("minLength:"));
    found.push({ schema, line: i + 1, min: min ? Number(min.split(":")[1].trim()) : null });
  }

  return found;
}

const declared = Number(
  /MIN_PASSWORD_LENGTH\s*=\s*(\d+)/.exec(readFileSync(CONSTANT, "utf8"))?.[1] ?? NaN,
);

if (!Number.isInteger(declared)) {
  console.error(`Could not read MIN_PASSWORD_LENGTH from ${CONSTANT}.`);
  process.exit(1);
}

const fields = passwordFields(readFileSync(SPEC, "utf8"));
const governed = fields.filter((field) => !NO_POLICY.includes(field.schema));
const exempt = fields.filter((field) => NO_POLICY.includes(field.schema));

if (governed.length === 0) {
  console.error(
    "Found no password fields in the contract that carry a policy.\n" +
      "Either the contract changed shape or this check stopped matching. " +
      "Both mean it is no longer checking anything.",
  );
  process.exit(1);
}

if (exempt.length !== NO_POLICY.length) {
  console.error(
    `Expected to find ${NO_POLICY.join(", ")} in the contract and did not.\n` +
      "An exclusion that excludes nothing is stale: either the schema was renamed, " +
      "in which case update NO_POLICY, or it is gone, in which case remove it.",
  );
  process.exit(1);
}

const wrong = governed.filter((field) => field.min !== declared);

if (wrong.length > 0) {
  console.error(
    `The forms enforce a minimum of ${declared} characters. The contract disagrees:\n` +
      wrong.map((f) => `  ${f.schema} declares ${f.min}  (openapi/v1.yaml:${f.line})`).join("\n") +
      "\n\nThe server owns this number. If it moved, run `make sync-spec` in the API " +
      "repository, then update src/lib/password.ts to match.",
  );
  process.exit(1);
}

console.log(
  `Password floor: ${declared} characters across ${governed.length} contract fields ` +
    `(${governed.map((f) => f.schema).join(", ")}); ` +
    `${exempt.map((f) => f.schema).join(", ")} exempt by design.`,
);
