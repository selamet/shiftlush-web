import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be taught this project's custom scales.
 *
 * Without this it cannot tell `text-body` (a font size from our type scale)
 * from `text-destructive-foreground` (a colour). It puts both in the same
 * conflict group, keeps the last one, and silently drops the colour — which
 * left every button variant rendering dark text on its coloured background.
 *
 * Any new value added to a `--text-*`, `--radius-*` or `--spacing-control-*`
 * token in globals.css must be listed here too.
 */
const TEXT_SIZES = [
  "title",
  "section",
  "cardtitle",
  "body",
  "label",
  "cell",
  "help",
  "colhead",
];

const CONTROL_SIZES = [
  "control-xs",
  "control-sm",
  "control-md",
  "control-lg",
  "control-xl",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TEXT_SIZES }],
      rounded: [{ rounded: ["xs"] }],
      w: [{ w: CONTROL_SIZES }],
      h: [{ h: CONTROL_SIZES }],
      size: [{ size: CONTROL_SIZES }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
