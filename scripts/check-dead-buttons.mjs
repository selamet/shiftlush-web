#!/usr/bin/env node
/**
 * Fails when a button is rendered with no way to activate it.
 *
 * Thirty-one of these shipped. They all arrived the same way: a screen was
 * written as a design, the buttons were placed so the layout could be judged,
 * the wiring was left for later, and later never came. Nothing catches that —
 * it type-checks, it builds, it renders, and it looks finished. The only signal
 * is a user pressing it and nothing happening, which is the most expensive
 * place in the whole pipeline to find out.
 *
 * A button is considered wired when any of these is true:
 *
 *   - it carries an activation handler (onClick and the rest of ACTIVATION);
 *   - it is `type="submit"`, so it submits the form it sits in;
 *   - a `<button>` with no `type` at all, which HTML defaults to submit;
 *   - it sits inside a `<Link>` or an `<a>`, so the link handles the click;
 *   - it carries `asChild`, `to` or `href`, so it renders as a link itself;
 *   - it spreads props, which may carry a handler this check cannot see.
 *
 * `disabled` is deliberately NOT a defence. A button disabled by an expression
 * becomes enabled sooner or later and must do something when it does; a button
 * disabled outright is inert on purpose, and "on purpose" is exactly the kind
 * of claim that should be written down. Both take the escape hatch below.
 *
 * The escape hatch is a comment within three lines above the button:
 *
 *   {/* dead-button-ok: opens the native picker through inputRef, no handler *\/}
 *
 * The reason is mandatory and is checked for length, because an escape hatch
 * that can be taken silently is not an escape hatch, it is an off switch.
 *
 * Two things this check refuses to do quietly:
 *
 *   - report success having matched nothing. check-api-paths.mjs in this same
 *     directory verified precisely nothing for weeks behind a green tick, and
 *     that is the failure mode worth designing against: a check that catches
 *     nothing still counts as coverage while protecting nothing. Finding no
 *     buttons at all, or no wired buttons at all, is therefore a failure.
 *   - carry an exemption that exempts nothing. The styleguide exclusion must
 *     match a real inert button, and every baseline entry must match a real
 *     dead one, or the check fails and names the line to delete. A baseline
 *     nobody is forced to shrink is just a list of things nobody will fix.
 */
import ts from "typescript";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "scripts", "dead-button-baseline.json");

/**
 * The gallery renders every button variant side by side so they can be
 * compared. Those buttons have nothing to do and never will.
 *
 * The files are still parsed, their buttons still counted, and the exemption
 * still has to earn its place — see the check on `gallery.length` below. What
 * is excused here is the wiring requirement, not the directory.
 */
const GALLERY_PREFIX = "src/styleguide/";

/** The component's own definition. Its `<button>` is the thing being defined. */
const COMPONENT_DEFINITION = "src/components/ui/button.tsx";

/** How a button is activated. A button with none of these has no way in. */
const ACTIVATION = new Set([
  "onClick",
  "onAuxClick",
  "onDoubleClick",
  "onMouseDown",
  "onMouseUp",
  "onPointerDown",
  "onPointerUp",
  "onTouchStart",
  "onTouchEnd",
  "onKeyDown",
  "onKeyUp",
  "onKeyPress",
]);

/** Props that make the button navigate rather than handle a click. */
const NAVIGATES = new Set(["asChild", "to", "href"]);

/** An ancestor of one of these shapes takes the click on the button's behalf. */
const LINKS = new Set(["Link", "a"]);

const HATCH = /dead-button-ok:\s*([^*}\n]*)/;
const HATCH_REACH = 3;
const HATCH_MIN_REASON = 12;
const HATCH_PLACEHOLDER = /^(todo|tbd|fixme|later|wip|soon|n\/?a|\?+|-+)$/i;

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (full.endsWith(".tsx")) files.push(full);
  }
  return files.sort();
}

/** Names this file imports from the shared button module. */
function uiButtonNames(source, sourceFile) {
  const names = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = statement.moduleSpecifier.getText(sourceFile).slice(1, -1);
    if (!/components\/ui\/button$/.test(from) && from !== "./button") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) names.add(element.name.getText(sourceFile));
    }
  }
  return names;
}

/** The nearest named function around a node — the component it is drawn in. */
function enclosingName(node, sourceFile) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) && parent.name) return parent.name.getText(sourceFile);
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.getText(sourceFile);
    }
  }
  return null;
}

/**
 * A short, stable name for one button: its aria-label, its translation key, or
 * its literal text. Line numbers move every time a branch lands above them, so
 * the baseline is keyed on this instead — an entry has to survive four other
 * branches editing the file above it, or it goes stale for the wrong reason.
 */
function labelOf(opening, element, sourceFile) {
  const attributeText = (name) => {
    for (const property of opening.attributes.properties) {
      if (ts.isJsxSpreadAttribute(property)) continue;
      if (property.name.getText(sourceFile) !== name) continue;
      return property.initializer?.getText(sourceFile) ?? "";
    }
    return "";
  };

  for (const attribute of ["aria-label", "title"]) {
    const raw = attributeText(attribute);
    const key = /t\(\s*["'`]([^"'`]+)/.exec(raw)?.[1];
    if (key) return key;
    if (raw.startsWith('"') || raw.startsWith("'")) return raw.slice(1, -1);
  }

  const body = element.getText(sourceFile);
  const key = /\bt\(\s*["'`]([^"'`]+)/.exec(body)?.[1];
  if (key) return key;

  if (ts.isJsxElement(element)) {
    for (const child of element.children) {
      if (!ts.isJsxText(child)) continue;
      const text = child.getText(sourceFile).trim();
      if (text) return text.slice(0, 40);
    }
  }

  // `t(someKeyVariable)` — the label is chosen by the caller. Name the variable
  // rather than giving up: it is what the reader will search the file for.
  const variable = /\bt\(\s*([A-Za-z_$][\w$.]*)\s*[,)]/.exec(body)?.[1];
  if (variable) return variable;

  return enclosingName(element, sourceFile) ?? "(unlabelled)";
}

/** Every `<button>` and shared `<Button>` in one file, with how it is wired. */
function analyse(text, path) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const shared = uiButtonNames(source, source);

  const found = [];
  const openLinks = [];

  const visit = (node) => {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null;

    if (!opening) {
      ts.forEachChild(node, visit);
      return;
    }

    const tag = opening.tagName.getText(source);
    const isLink = LINKS.has(tag) || /Link$/.test(tag);
    if (isLink) openLinks.push(tag);

    if (tag === "button" || shared.has(tag)) {
      const attributes = new Set();
      let spread = false;
      let type = null;

      for (const property of opening.attributes.properties) {
        if (ts.isJsxSpreadAttribute(property)) {
          spread = true;
          continue;
        }
        const name = property.name.getText(source);
        attributes.add(name);
        if (name === "type") type = property.initializer?.getText(source) ?? "";
      }

      const submits =
        /submit/.test(type ?? "") ||
        // Bare `<button>` is `type="submit"` per HTML. Only the intrinsic
        // element defaults that way; the shared component forces "button".
        (tag === "button" && type === null);

      const handlers = [...attributes].filter((name) => ACTIVATION.has(name));
      const navigates = [...attributes].some((name) => NAVIGATES.has(name));
      const { line } = source.getLineAndCharacterOfPosition(opening.getStart(source));

      found.push({
        file: path,
        line: line + 1,
        tag,
        label: labelOf(opening, node, source),
        wired: handlers.length > 0 || submits || navigates || spread || openLinks.length > 0,
        reason: submits
          ? "submits its form"
          : handlers.length > 0
            ? handlers.join(", ")
            : navigates
              ? "renders as a link"
              : spread
                ? "spreads props"
                : openLinks.length > 0
                  ? `inside <${openLinks.at(-1)}>`
                  : attributes.has("disabled")
                    ? "disabled, and nothing to do when it is not"
                    : "no handler, no form, no link",
      });
    }

    ts.forEachChild(node, visit);
    if (isLink) openLinks.pop();
  };

  visit(source);

  // Same label twice in one file would collide in the baseline. Number the
  // repeats in document order so each entry still points at exactly one button.
  // Wired buttons take a number too: leaving them out would renumber the dead
  // ones every time a sibling above them was wired up, which is the one moment
  // the baseline most needs to stay readable.
  const seen = new Map();
  for (const button of found) {
    const count = (seen.get(button.label) ?? 0) + 1;
    seen.set(button.label, count);
    button.key = `${button.label}${count > 1 ? `#${count}` : ""}`;
    button.id = `${button.file} :: ${button.key}`;
  }

  const hatches = [];
  text.split("\n").forEach((source_line, index) => {
    const match = HATCH.exec(source_line);
    if (match) hatches.push({ file: path, line: index + 1, reason: match[1].trim(), used: false });
  });

  return { buttons: found, hatches };
}

const buttonsIn = (file) => analyse(readFileSync(file, "utf8"), relative(ROOT, file));

/**
 * The check checks itself first.
 *
 * Six of the rules above are permissive — they are the reasons a button is
 * allowed to have no onClick — and three of them match nothing in this
 * codebase today. An unexercised permissive rule is the same hazard as an
 * unexercised pattern: it is believed to work, nobody finds out otherwise, and
 * the day someone writes `<Link><Button/></Link>` the check either cries wolf
 * or waves through a dead button, with no way to tell which from the outside.
 *
 * So every rule is exercised on every run against a shape it is supposed to
 * decide, and a rule that stops deciding correctly fails the build here rather
 * than silently changing what CI means.
 */
const IMPORT = 'import { Button } from "@/components/ui/button";\n';
const SELF_TEST = [
  ["<Button onClick={go}>x</Button>", true, "onClick is the ordinary case"],
  ["<Button onKeyDown={go}>x</Button>", true, "any activation handler, not just onClick"],
  ['<Button type="submit">x</Button>', true, "submits the form it sits in"],
  ["<button>x</button>", true, "a bare <button> is type=submit per HTML"],
  ['<button type="button">x</button>', false, "an explicit type=button with no handler"],
  ["<Link to=\"/x\"><Button>y</Button></Link>", true, "the enclosing Link takes the click"],
  ['<a href="/x"><button type="button">y</button></a>', true, "an enclosing anchor does too"],
  ['<Button asChild><a href="/x">y</a></Button>', true, "asChild renders it as the link"],
  ['<Button to="/x">y</Button>', true, "a `to` prop navigates"],
  ['<Button href="/x">y</Button>', true, "so does an `href`"],
  ["<Button {...rest}>y</Button>", true, "a spread may carry a handler this cannot see"],
  ["<Button disabled>y</Button>", false, "disabled is not a defence; it needs a reason"],
  ["<Button disabled={busy}>y</Button>", false, "and neither is being disabled today"],
  ['<Button variant="ghost">y</Button>', false, "the shape this whole check exists for"],
];

for (const [markup, expected, why] of SELF_TEST) {
  const { buttons: parsed } = analyse(`${IMPORT}export const C = () => (${markup});\n`, "self-test.tsx");
  if (parsed.length !== 1) {
    console.error(
      `This check found ${parsed.length} buttons in a fixture that contains exactly one:\n` +
        `  ${markup}\n\n` +
        "It is no longer reading JSX the way it thinks it is.",
    );
    process.exit(1);
  }
  const [subject] = parsed;
  if (subject.wired !== expected) {
    console.error(
      `This check has stopped judging its own rules correctly.\n\n` +
        `  ${markup}\n` +
        `  expected: ${expected ? "wired" : "dead"} — ${why}\n` +
        `  got:      ${subject.wired ? "wired" : "dead"} (${subject.reason})\n\n` +
        "Fix the rule before trusting anything else this check says about src/.",
    );
    process.exit(1);
  }
}

{
  const { buttons: labelled } = analyse(
    `${IMPORT}export const C = () => (<Button aria-label={t("a.b")} />);\n`,
    "self-test.tsx",
  );
  if (labelled[0]?.key !== "a.b") {
    console.error(
      `Button names no longer resolve: expected "a.b", got "${labelled[0]?.key}".\n` +
        "Every baseline entry is keyed on that name, so all of them would go stale at once.",
    );
    process.exit(1);
  }
}

{
  const { hatches: parsed } = analyse(
    `${IMPORT}export const C = () => (<>{/* dead-button-ok: a reason long enough */}<Button /></>);\n`,
    "self-test.tsx",
  );
  if (parsed.length !== 1 || parsed[0].reason !== "a reason long enough") {
    console.error(
      `The escape hatch no longer parses: got ${JSON.stringify(parsed.map((h) => h.reason))}.\n` +
        "Either every hatch in the codebase has silently stopped working, or every one\n" +
        "of them is about to be reported as stale. Fix the pattern.",
    );
    process.exit(1);
  }
}

const problems = [];
const fail = (...lines) => problems.push(lines.join("\n"));

if (!existsSync(SRC)) {
  console.error(`No src/ directory at ${SRC}. This check has nothing to read.`);
  process.exit(1);
}

const files = walk(SRC).filter((file) => relative(ROOT, file) !== COMPONENT_DEFINITION);
const buttons = [];
const hatches = [];
for (const file of files) {
  const result = buttonsIn(file);
  buttons.push(...result.buttons);
  hatches.push(...result.hatches);
}

// ---------------------------------------------------------------------------
// The check must not be able to pass by matching nothing.
// ---------------------------------------------------------------------------

if (buttons.length === 0) {
  console.error(
    "Found no buttons at all under src/.\n" +
      "Either every button is gone or this check stopped matching them. Both mean\n" +
      "it is no longer checking anything, and a check that catches nothing is worse\n" +
      "than no check — it counts as coverage while protecting nothing.",
  );
  process.exit(1);
}

if (buttons.every((button) => !button.wired)) {
  console.error(
    `Found ${buttons.length} buttons under src/ and judged every one of them dead.\n` +
      "That is not a codebase, that is a broken detector: the wiring rules match\n" +
      "nothing any more. Fix this check before believing its output.",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The escape hatch. A reason is mandatory, and an unused hatch is a stale one.
// ---------------------------------------------------------------------------

for (const hatch of hatches) {
  if (hatch.reason.length >= HATCH_MIN_REASON && !HATCH_PLACEHOLDER.test(hatch.reason)) continue;
  fail(
    `${hatch.file}:${hatch.line}  dead-button-ok with no usable reason: "${hatch.reason}"`,
    `      Silencing this check requires saying why, in at least ${HATCH_MIN_REASON} characters.`,
    "      An escape hatch that can be taken silently is an off switch.",
  );
}

const dead = [];
for (const button of buttons) {
  if (button.wired) continue;
  const hatch = hatches.find(
    (candidate) =>
      candidate.file === button.file &&
      candidate.line <= button.line &&
      candidate.line > button.line - 1 - HATCH_REACH &&
      candidate.reason.length >= HATCH_MIN_REASON &&
      !HATCH_PLACEHOLDER.test(candidate.reason),
  );
  if (hatch) {
    hatch.used = true;
    continue;
  }
  dead.push(button);
}

for (const hatch of hatches) {
  if (hatch.used || hatch.reason.length < HATCH_MIN_REASON) continue;
  fail(
    `${hatch.file}:${hatch.line}  dead-button-ok silences nothing.`,
    "      The button below it is wired, or moved, or gone. Delete the comment —",
    "      an exemption that exempts nothing is not an exemption, it is litter.",
  );
}

// ---------------------------------------------------------------------------
// The gallery. Excused from wiring, not excused from being looked at.
// ---------------------------------------------------------------------------

const gallery = dead.filter((button) => button.file.startsWith(GALLERY_PREFIX));
const live = dead.filter((button) => !button.file.startsWith(GALLERY_PREFIX));

if (gallery.length === 0) {
  fail(
    `The ${GALLERY_PREFIX} exclusion did not match a single inert button.`,
    "      Either the gallery moved, in which case update GALLERY_PREFIX, or its",
    "      buttons are wired now, in which case delete the exclusion. A stale",
    "      exemption is not an exemption.",
  );
}

// ---------------------------------------------------------------------------
// The baseline: what was already dead when this check landed, and who owns it.
// ---------------------------------------------------------------------------

if (!existsSync(BASELINE)) {
  console.error(`No baseline at ${relative(ROOT, BASELINE)}. Write one, even if it is empty.`);
  process.exit(1);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch (error) {
  console.error(`${relative(ROOT, BASELINE)} is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!Array.isArray(baseline.entries)) {
  console.error(`${relative(ROOT, BASELINE)} has no "entries" array.`);
  process.exit(1);
}

const deadById = new Map(live.map((button) => [button.id, button]));
const excused = new Set();

baseline.entries.forEach((entry, index) => {
  const where = `${relative(ROOT, BASELINE)} entry ${index + 1}`;
  if (typeof entry.button !== "string" || !entry.button.includes(" :: ")) {
    fail(`${where}: "button" must be the "<file> :: <label>" id this check prints.`);
    return;
  }
  if (typeof entry.owner !== "string" || entry.owner.trim().length === 0) {
    fail(`${where} (${entry.button}): "owner" must name the branch that is fixing it.`);
    return;
  }
  if (typeof entry.note !== "string" || entry.note.trim().length < HATCH_MIN_REASON) {
    fail(`${where} (${entry.button}): "note" must say what the button should do.`);
    return;
  }
  if (!deadById.has(entry.button)) {
    fail(
      `${where} is stale: ${entry.button}`,
      `      Recorded as dead, owned by ${entry.owner}, and no longer found.`,
      "      It was fixed, renamed, or deleted. Delete this entry — a baseline that",
      "      is never made to shrink stops being a debt and becomes a permission.",
    );
    return;
  }
  excused.add(entry.button);
});

const unexcused = live.filter((button) => !excused.has(button.id));

// ---------------------------------------------------------------------------

if (unexcused.length > 0) {
  console.error(`Buttons that do nothing when pressed (${unexcused.length}):\n`);
  for (const button of unexcused) {
    console.error(`  ${button.file}:${button.line}  <${button.tag}> ${button.key}`);
    console.error(`      ${button.reason}`);
  }
  console.error(
    "\nA button on screen is a promise that pressing it does something. Wire it with\n" +
      "onClick, give it type=\"submit\" if it submits a form, or wrap it in <Link> if it\n" +
      "navigates. If it is inert on purpose, say so above it:\n\n" +
      "    {/* dead-button-ok: <why this button has nothing to do> *" +
      "/}\n\n" +
      `If it belongs to work already in flight, record it in ${relative(ROOT, BASELINE)}\n` +
      "with the branch that owns it — and delete that entry when the branch lands.\n" +
      'The "button" field of an entry is "<file> :: <name>", both printed above:\n\n' +
      `    { "button": "${unexcused[0].id}",\n` +
      `      "owner": "#123", "note": "what it should do once it is wired" }`,
  );
  problems.unshift("");
}

if (problems.length > 0) {
  for (const problem of problems) if (problem) console.error(`\n${problem}`);
  process.exit(1);
}

const excusedNote = excused.size > 0 ? `, ${excused.size} baselined` : "";
console.log(
  `Every button is wired — ${buttons.length} checked across ${files.length} files ` +
    `(${gallery.length} inert by design in ${GALLERY_PREFIX}${excusedNote}) — OK`,
);
