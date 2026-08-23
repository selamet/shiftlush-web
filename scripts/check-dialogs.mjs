#!/usr/bin/env node
/**
 * Proves that the overlays claiming `aria-modal="true"` behave like dialogs.
 *
 * `smoke-render.mjs` renders. That is worth a lot and it is not enough here:
 * every fault this check exists to catch survives a render untouched. The
 * markup that shipped rendered perfectly while Escape did nothing, focus was
 * never moved in or handed back, the page behind stayed tabbable and readable
 * to a screen reader, and the first Tab press landed on an invisible
 * screen-covering "close" button that sat in front of the panel in the DOM.
 * None of that is visible in a string of HTML — it only exists once there is a
 * document, a focus ring and a key press. So this one drives a real DOM.
 *
 * Six properties, asserted against every overlay shape the app has:
 *
 *   1. opening moves focus into the panel;
 *   2. everything behind the panel is `inert` — out of the tab order and out
 *      of the accessibility tree, which is what `aria-modal` promises;
 *   3. nothing tabbable is left reachable outside the panel, which is the
 *      statement "the first Tab press lands inside the dialog" in a form that
 *      can be checked;
 *   4. Tab and Shift+Tab wrap at the ends instead of leaving;
 *   5. Escape closes;
 *   6. closing restores the page and hands focus back to the control that
 *      opened it — never to `<body>`.
 *
 * Plus two source rules, because both regressions this fixes were introduced
 * by copying markup: `aria-modal` may only be claimed by the component that
 * can honour it, and no overlay may go back to a tabbable backdrop.
 *
 * The same document then answers the other question a rendered string cannot:
 * whether the controls that were deliberately left out of the tab order can be
 * operated at all. The date picker keeps focus in its text box on purpose, so
 * its calendar, its "today" and its clear are all `tabIndex={-1}` — which is
 * only a design if every one of them has a key on the field instead, and is a
 * control nobody can reach otherwise. That is asserted by pressing the keys.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import React, { act } from "react";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const MODAL = join(SRC, "components/ui/modal.tsx");

/* -------------------------------------------------------------------------
 * A document, installed as globals before react-dom is loaded.
 * ---------------------------------------------------------------------- */

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// jsdom ships no media queries. Nothing under test reads one; the stub is here
// so a component that does cannot take the harness down with it.
globalThis.matchMedia = window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
for (const name of [
  "Element",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "Node",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
  "DocumentFragment",
  "Text",
  "SVGElement",
  "MutationObserver",
]) {
  globalThis[name] = window[name];
}
try {
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
} catch {
  // Node supplies one of its own. React only reads `userAgent` from it.
}

// Without this `act` refuses to flush effects, and effects are where every
// behaviour under test lives.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { document } = window;
const { createRoot } = await import("react-dom/client");

const h = React.createElement;

/** The same selector `modal.tsx` uses, restated so a drift between them shows up as a failure. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function press(
  target,
  key,
  { shiftKey = false, ctrlKey = false, altKey = false, metaKey = false } = {},
) {
  const event = new window.KeyboardEvent("keydown", {
    key,
    shiftKey,
    ctrlKey,
    altKey,
    metaKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

/** True when the element sits inside a subtree something has marked inert. */
function behindAnInertWall(element) {
  for (let node = element; node; node = node.parentElement) {
    if (node.hasAttribute?.("inert")) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------
 * The page the dialog opens on top of.
 * ---------------------------------------------------------------------- */

// A sibling of the React root, so the walk out of the overlay has to reach the
// top of the document rather than stopping at the component that owns it.
const outside = document.createElement("div");
outside.id = "outside";
outside.innerHTML = '<button type="button">a control on the shell</button>';
document.body.appendChild(outside);

const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);

const render = (element) => act(async () => root.render(element));

/** The opener and some page content, with the dialog rendered as a sibling of both. */
function Page({ dialog }) {
  return h(
    "div",
    null,
    h("button", { id: "opener", type: "button", onClick: () => {} }, "open the dialog"),
    h("main", { id: "behind" }, h("a", { href: "/elsewhere" }, "a link on the page behind")),
    dialog,
  );
}

/* -------------------------------------------------------------------------
 * The battery.
 * ---------------------------------------------------------------------- */

const failures = [];

async function battery(subject) {
  const checks = [];
  const check = (name, ok, detail = "") => {
    checks.push({ name, ok });
    if (!ok) failures.push(`${subject.name}: ${name}${detail ? ` — ${detail}` : ""}`);
  };

  subject.closed = 0;
  await render(h(Page, { dialog: subject.element(false) }));

  const opener = document.getElementById("opener");
  const behind = document.getElementById("behind");
  opener.focus();

  await render(h(Page, { dialog: subject.element(true) }));

  const panel = document.querySelector("[aria-modal='true']");
  if (!panel) {
    check("the dialog is on the page", false, "no [aria-modal] element rendered");
    return checks;
  }
  const overlay = panel.parentElement;

  check(
    "opening moves focus into the panel",
    document.activeElement === panel,
    `focus is on ${describe(document.activeElement)}`,
  );

  check(
    "the panel is the announced role",
    panel.getAttribute("role") === subject.role,
    `role="${panel.getAttribute("role")}"`,
  );

  check(
    "the page behind is inert",
    opener.hasAttribute("inert") && behind.hasAttribute("inert"),
    `opener ${opener.hasAttribute("inert") ? "inert" : "live"}, page ${behind.hasAttribute("inert") ? "inert" : "live"}`,
  );

  check(
    "inerting reaches past the component that owns the dialog",
    outside.hasAttribute("inert"),
    "the shell around the React root is still reachable",
  );

  const reachable = [...document.querySelectorAll(FOCUSABLE)].filter(
    (element) => !panel.contains(element) && !behindAnInertWall(element),
  );
  check(
    "nothing tabbable is left outside the panel",
    reachable.length === 0,
    reachable.map(describe).join(", "),
  );

  const backdrop = overlay.firstElementChild;
  check(
    "the backdrop is not a tabbable button in front of the panel",
    backdrop !== panel &&
      backdrop.tagName !== "BUTTON" &&
      backdrop.getAttribute("aria-hidden") === "true" &&
      !backdrop.matches(FOCUSABLE),
    `first child of the overlay is <${backdrop.tagName.toLowerCase()}>`,
  );

  const items = [...panel.querySelectorAll(FOCUSABLE)];
  const first = items[0];
  const last = items[items.length - 1];
  check("the panel has controls to cycle between", items.length >= 2, `${items.length} found`);

  if (items.length >= 2) {
    last.focus();
    await act(async () => press(last, "Tab"));
    check(
      "Tab off the last control wraps to the first",
      document.activeElement === first,
      `focus is on ${describe(document.activeElement)}`,
    );

    first.focus();
    await act(async () => press(first, "Tab", { shiftKey: true }));
    check(
      "Shift+Tab off the first control wraps to the last",
      document.activeElement === last,
      `focus is on ${describe(document.activeElement)}`,
    );

    panel.focus();
    await act(async () => press(panel, "Tab", { shiftKey: true }));
    check(
      "Shift+Tab off the panel itself wraps to the last control",
      document.activeElement === last,
      `focus is on ${describe(document.activeElement)}`,
    );
  }

  await act(async () => press(panel, "Escape"));
  check("Escape asks the dialog to close", subject.closed === 1, `${subject.closed} close(s)`);

  if (subject.capped) {
    check(
      "the panel is capped in height and scrolls inside itself",
      panel.className.includes("max-h-[90vh]") && panel.className.includes("overflow-y-auto"),
      panel.className,
    );
  }

  // What the caller does when it is told to close.
  await render(h(Page, { dialog: subject.element(false) }));

  check(
    "closing restores the page",
    !opener.hasAttribute("inert") &&
      !behind.hasAttribute("inert") &&
      !outside.hasAttribute("inert"),
    "something is still inert",
  );

  check(
    "closing hands focus back to the control that opened it",
    document.activeElement === opener,
    `focus is on ${describe(document.activeElement)}`,
  );

  check(
    "focus is never dropped on <body>",
    document.activeElement !== document.body,
    "the next Tab would start again from the top of the page",
  );

  return checks;
}

function describe(element) {
  if (!element || element === document.body) return "<body>";
  const id = element.id ? `#${element.id}` : "";
  const role = element.getAttribute?.("role");
  return `<${element.tagName.toLowerCase()}${id}${role ? ` role=${role}` : ""}>`;
}

/* -------------------------------------------------------------------------
 * The controls that are deliberately not in the tab order.
 * ---------------------------------------------------------------------- */

/** `FOCUSABLE`, narrowed to what Tab will actually stop on. */
const TABBABLE = FOCUSABLE.split(",")
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(",");

/**
 * The date picker's calendar, its "today" and its clear are all out of the tab
 * order, and that is the right answer only while each of them has a key on the
 * field instead. This presses the keys.
 */
async function datePickerKeys({ DatePicker, todayIso, toDisplay }) {
  const checks = [];
  const check = (name, ok, detail = "") => {
    checks.push({ name, ok });
    if (!ok) failures.push(`date picker: ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const START = "2026-03-05";
  let instance = 0;

  /** A fresh, uncontrolled picker holding `START`, with a field after it to tab to. */
  async function mount() {
    instance += 1;
    await render(
      h(
        "div",
        null,
        h(
          "div",
          { id: "picker-host" },
          h(DatePicker, { key: `picker-${instance}`, name: "start_date", defaultValue: START }),
        ),
        h("input", { id: "after", type: "text" }),
      ),
    );
    const host = document.getElementById("picker-host");
    return {
      host,
      box: host.querySelector("input[role='combobox']"),
      hidden: host.querySelector("input[type='hidden'][name='start_date']"),
    };
  }

  // What the clear button does, for someone who cannot reach it.
  {
    const { box, hidden } = await mount();
    box.focus();
    await act(async () => press(box, "Escape"));
    check(
      "Escape empties a field whose calendar is closed",
      box.value === "" && hidden.value === "",
      `box "${box.value}", form would submit "${hidden.value}"`,
    );
    check(
      "clearing leaves focus in the text box",
      document.activeElement === box,
      `focus is on ${describe(document.activeElement)}`,
    );
  }

  // Escape peels one layer at a time: the calendar first, the date second.
  {
    const { box, hidden } = await mount();
    box.focus();
    await act(async () => press(box, "ArrowDown", { altKey: true }));
    check(
      "Alt+ArrowDown opens the calendar",
      box.getAttribute("aria-expanded") === "true",
      `aria-expanded="${box.getAttribute("aria-expanded")}"`,
    );

    await act(async () => press(box, "Escape"));
    check(
      "the first Escape closes the calendar and keeps the date",
      box.getAttribute("aria-expanded") === "false" && hidden.value === START,
      `aria-expanded="${box.getAttribute("aria-expanded")}", value "${hidden.value}"`,
    );

    await act(async () => press(box, "Escape"));
    check("the second Escape empties the field", hidden.value === "", `value "${hidden.value}"`);
  }

  // The reason the field may only take the press when it has something to say:
  // a dialog around it listens for the same key, on the document.
  {
    const reached = [];
    const listener = (event) => {
      if (event.key === "Escape") reached.push(event);
    };
    document.addEventListener("keydown", listener);
    try {
      const { box } = await mount();
      box.focus();

      await act(async () => press(box, "Escape"));
      const afterClearing = reached.length;
      await act(async () => press(box, "Escape"));

      check(
        "Escape stops at a field that has a date to clear",
        afterClearing === 0,
        `${afterClearing} press(es) reached the document`,
      );
      check(
        "Escape passes through an empty field, so the dialog around it still closes",
        reached.length === 1,
        `${reached.length} press(es) reached the document`,
      );
    } finally {
      document.removeEventListener("keydown", listener);
    }
  }

  // What the "today" button does, for someone who cannot reach it — from a
  // field that already holds another date, which is the case with no keyboard
  // route at all before this: opening the calendar puts the cursor on the day
  // that is selected, not on today.
  {
    const today = todayIso();

    const { box, hidden } = await mount();
    box.focus();
    await act(async () => press(box, "Home", { ctrlKey: true }));
    check(
      "Ctrl+Home writes today over the date that was there",
      hidden.value === today && box.value === toDisplay(today),
      `box "${box.value}", form would submit "${hidden.value}", today is ${today}`,
    );
    check(
      "picking today leaves focus in the text box",
      document.activeElement === box,
      `focus is on ${describe(document.activeElement)}`,
    );

    const mac = await mount();
    mac.box.focus();
    await act(async () => press(mac.box, "Home", { metaKey: true }));
    check(
      "Cmd+Home does the same, for the keyboard without a Ctrl in reach",
      mac.hidden.value === today,
      `form would submit "${mac.hidden.value}"`,
    );
  }

  // And the property both bindings exist to protect.
  {
    const { host, box } = await mount();
    box.focus();
    await act(async () => press(box, "ArrowDown", { altKey: true }));

    check(
      "the calendar is on the page for these",
      Boolean(host.querySelector("td[role='gridcell'] button")),
      "no day cell rendered",
    );

    const stops = [...host.querySelectorAll(TABBABLE)].filter(
      (element) => element.getAttribute("type") !== "hidden",
    );
    check(
      "an open calendar still costs the tab order exactly one stop, the text box",
      stops.length === 1 && stops[0] === box,
      stops.map(describe).join(", "),
    );

    // Anything the picker draws outside the day grid is out of the tab order,
    // so each one has to name the key that stands in for it. A control added
    // later with no key fails here rather than shipping unreachable.
    const stranded = [...host.querySelectorAll("button[tabindex='-1']")].filter(
      (button) =>
        !button.closest("[role='gridcell']") && !button.getAttribute("aria-keyshortcuts"),
    );
    check(
      "every control left out of the tab order names the key that reaches it",
      stranded.length === 0,
      stranded
        .map((button) => button.getAttribute("aria-label") ?? button.textContent.trim())
        .join(", "),
    );

    const announced = box.getAttribute("aria-keyshortcuts") ?? "";
    check(
      "the field announces those keys to a screen reader",
      announced.includes("Control+Home") && announced.includes("Escape"),
      `aria-keyshortcuts="${announced}"`,
    );
  }

  return checks;
}

/* -------------------------------------------------------------------------
 * Source rules.
 * ---------------------------------------------------------------------- */

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...sourceFiles(full));
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) files.push(full);
  }
  return files;
}

function sourceRules() {
  const results = [];
  const claims = [];
  const backdrops = [];

  for (const file of sourceFiles(SRC)) {
    if (file === MODAL) continue;
    const source = readFileSync(file, "utf8");
    source.split("\n").forEach((line, index) => {
      const at = `${relative(ROOT, file)}:${index + 1}`;
      if (line.includes("aria-modal")) claims.push(at);
      // The backdrop that was a button. Any focusable element covering the
      // screen inside an overlay puts itself in front of the dialog.
      if (/<button[\s\S]{0,400}?absolute inset-0/.test(line) || /absolute inset-0 bg-foreground/.test(line)) {
        backdrops.push(at);
      }
    });
  }

  results.push({
    name: "`aria-modal` is claimed only where it can be honoured",
    ok: claims.length === 0,
    detail: claims.join(", "),
  });
  results.push({
    name: "no screen builds its own backdrop",
    ok: backdrops.length === 0,
    detail: backdrops.join(", "),
  });

  for (const result of results) {
    if (!result.ok) failures.push(`source: ${result.name} — ${result.detail}`);
  }
  return results;
}

/* -------------------------------------------------------------------------
 * Run.
 * ---------------------------------------------------------------------- */

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
  // Nothing here is served to a browser, so the client dependency scan has no
  // work to do — and left on, it is still crawling the module graph when the
  // verdict is printed and the server closes under it, which buries the result
  // in three hundred lines of esbuild teardown.
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  await server.ssrLoadModule("/src/lib/i18n.ts");
  // Through the app's own module graph, so the components under test are the
  // ones the app ships rather than a second copy resolved differently.
  const { Modal } = await server.ssrLoadModule("/src/components/ui/modal.tsx");
  const { ConfirmDialog } = await server.ssrLoadModule(
    "/src/components/ui/confirm-dialog.tsx",
  );
  const { DatePicker } = await server.ssrLoadModule("/src/components/ui/date-picker.tsx");
  const { todayIso, toDisplay } = await server.ssrLoadModule("/src/lib/date.ts");

  const subjects = [
    {
      name: "ConfirmDialog, heavy",
      role: "alertdialog",
      capped: true,
      closed: 0,
      element(open) {
        return h(ConfirmDialog, {
          open,
          weight: "heavy",
          title: "Terminate the contract",
          body: "Naming what happens next.",
          consequences: ["one", "two"],
          confirmLabel: "Terminate",
          onConfirm: () => {},
          onCancel: () => {
            this.closed += 1;
          },
        });
      },
    },
    {
      // The shape both contract dialogs now take: a centred panel with a body
      // the caller supplies.
      name: "Modal, centred with custom content",
      role: "alertdialog",
      capped: true,
      closed: 0,
      element(open) {
        return h(
          Modal,
          {
            open,
            role: "alertdialog",
            label: "Terminate the contract",
            className: "max-w-lg",
            onClose: () => {
              this.closed += 1;
            },
          },
          h("input", { key: "reason", defaultValue: "" }),
          h("button", { key: "cancel", type: "button", onClick: () => {} }, "Cancel"),
          h("button", { key: "confirm", type: "button", onClick: () => {} }, "Terminate"),
        );
      },
    },
    {
      // The navigation drawer.
      name: "Modal, drawer from the edge",
      role: "dialog",
      capped: false,
      closed: 0,
      element(open) {
        return h(
          Modal,
          {
            open,
            label: "Menu",
            placement: "inline-start",
            overlayClassName: "lg:hidden",
            className: "w-64",
            onClose: () => {
              this.closed += 1;
            },
          },
          h("button", { key: "close", type: "button", onClick: () => {} }, "Close"),
          h("a", { key: "link", href: "/elevators" }, "Elevators"),
        );
      },
    },
  ];

  for (const subject of subjects) {
    const checks = await battery(subject);
    const bad = checks.filter((entry) => !entry.ok);
    console.log(`  ${bad.length === 0 ? "OK  " : "FAIL"}  ${subject.name}`);
    for (const entry of checks) {
      console.log(`          ${entry.ok ? "+" : "!"} ${entry.name}`);
    }
  }

  console.log("");
  {
    const checks = await datePickerKeys({ DatePicker, todayIso, toDisplay });
    const bad = checks.filter((entry) => !entry.ok);
    console.log(`  ${bad.length === 0 ? "OK  " : "FAIL"}  Date picker, the controls with no tab stop`);
    for (const entry of checks) {
      console.log(`          ${entry.ok ? "+" : "!"} ${entry.name}`);
    }
  }

  console.log("");
  for (const rule of sourceRules()) {
    console.log(`  ${rule.ok ? "OK  " : "FAIL"}  ${rule.name}`);
    if (!rule.ok) console.log(`          at ${rule.detail}`);
  }
} finally {
  await server.close();
}

console.log("");
if (failures.length > 0) {
  console.error(`${failures.length} dialog behaviour failure(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
} else {
  console.log(
    "Escape, focus containment and focus return hold for every dialog shape, and every\n" +
      "control left out of the tab order can still be reached from the keyboard",
  );
}

// Vite and jsdom both leave timers behind; the verdict is in, so end rather
// than wait for the event loop to agree. Same reasoning as smoke-render.mjs.
process.exit(failures.length > 0 ? 1 : 0);
