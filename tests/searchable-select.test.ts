/**
 * What a search box costs the server while somebody is still typing.
 *
 * The neighbourhood picker asked the API on every keystroke: seven characters
 * was six requests, none of them cancelled, and the list the user acted on was
 * whichever answer came back last rather than whichever question was asked
 * last. Every other search box in the product waits for the typing to stop.
 *
 * These drive the real component through jsdom rather than testing a timer in
 * isolation, because the thing worth protecting is the behaviour of the field —
 * a debounce sitting in a helper nothing calls would pass a unit test and leave
 * the six requests exactly where they were.
 */

// @vitest-environment jsdom
//
// The only file here that needs a DOM. Declared per file rather than in the
// config so the other suites keep running in plain node, where they are faster
// and where an accidental reliance on a browser global fails loudly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SearchableSelect } from "@/components/ui/searchable-select";

const OPTIONS = [
  { value: "1", label: "Küçükbakkalköy" },
  { value: "2", label: "Kozyatağı" },
];

let container: HTMLDivElement;
let root: Root;
let mounted = false;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no layout, so it implements none of the scrolling API. The
  // component keeps the active option in view; without this the first keystroke
  // throws and the test reads as a component bug rather than a missing stub.
  Element.prototype.scrollIntoView = () => {};
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  vi.useFakeTimers();
});

afterEach(() => {
  // Guarded: one test unmounts deliberately, and unmounting twice throws.
  if (mounted) act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function unmount() {
  act(() => root.unmount());
  mounted = false;
}

function render(onSearchChange: (q: string) => void) {
  act(() => {
    root.render(
      React.createElement(SearchableSelect, {
        options: OPTIONS,
        onSearchChange,
        placeholder: "Ara",
      }),
    );
  });
  const input = container.querySelector("input");
  if (!input) throw new Error("the field did not render an input");
  return input;
}

/** One character, the way a person produces it. */
function type(input: HTMLInputElement, text: string) {
  for (const character of text) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, input.value + character);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
}

describe("a search box that reaches the server", () => {
  it("asks once for a word, not once per letter", () => {
    const asked = vi.fn();
    const input = render(asked);

    type(input, "Küçükba");
    // Seven characters, and before the debounce that was seven calls — measured
    // by reverting the fix, not assumed. The field's minimum length gates the
    // query it builds, not the callback, so even the one- and two-character
    // prefixes reached the parent.
    expect(asked).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(300));

    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked).toHaveBeenCalledWith("Küçükba");
  });

  it("asks for what was typed last, not for a prefix of it", () => {
    // The failure the debounce prevents is not only volume. Six unordered
    // requests mean the list shown is whichever replied last, which on a bad
    // connection is regularly the shortest prefix — the widest, least useful
    // answer.
    const asked = vi.fn();
    const input = render(asked);

    type(input, "Koz");
    act(() => void vi.advanceTimersByTime(200));
    type(input, "yatağı");
    act(() => void vi.advanceTimersByTime(300));

    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked).toHaveBeenCalledWith("Kozyatağı");
  });

  it("does not leave a request queued behind a field that has gone", () => {
    const asked = vi.fn();
    const input = render(asked);

    type(input, "Küç");
    unmount();
    act(() => void vi.advanceTimersByTime(1000));

    // A timer that outlives its component reports into nothing, and in a form
    // that has been navigated away from it is a request nobody will read.
    expect(asked).not.toHaveBeenCalled();
  });
});
