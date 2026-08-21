import { cn } from "@/lib/utils";
import { enumLabel, isUnknownEnum } from "@/lib/i18n";
import { UnknownEnumChip } from "./status-chip";

/**
 * The periodic-inspection label — the one place in the system where saturated
 * fill is allowed.
 *
 * `inspection_label` is a data field whose value *is* a colour, so it cannot be
 * remapped to the palette. Three rules keep it from colliding with the system
 * status colours, which want the same four hues:
 *
 *  1. FORM — the data label is a filled 13px square. System status is a
 *     pale-background block or a 3px left stripe. Saturated fill inside a data
 *     cell always means "inspection label".
 *  2. SATURATION — label colours are matte and mid-saturation, like real vinyl
 *     stickers. System colours are either a very pale surface or dark ink; the
 *     saturation band in between is never used anywhere else.
 *  3. PLACEMENT — the label appears only in the "Etiket" column and in the
 *     record header. System status sits left of the row, under the field,
 *     above the form, or in the screen corner — never inside a data column.
 *
 * Colour never carries the meaning alone: the Turkish text sits beside the
 * square at full contrast. That is also why yellow measuring 3.7 in light
 * theme is acceptable — the square is a graphical object under WCAG 1.4.11
 * (3:1), not text.
 */

const SWATCH: Record<string, string> = {
  green: "bg-label-green",
  blue: "bg-label-blue",
  yellow: "bg-label-yellow",
  red: "bg-label-red",
};

interface InspectionLabelProps {
  value: string | null | undefined;
  /** Hides the text — only valid where a column header already names it. */
  swatchOnly?: boolean;
  className?: string;
}

export function InspectionLabel({ value, swatchOnly, className }: InspectionLabelProps) {
  if (!value) return null;
  if (isUnknownEnum("elevator.inspectionLabel", value)) {
    return <UnknownEnumChip value={value} />;
  }

  const text = enumLabel("elevator.inspectionLabel", value);
  const fill = SWATCH[value];

  return (
    <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-[13px] shrink-0 rounded-xs",
          // `none` is the system's own "no label yet" value: dashed and unfilled,
          // matching the dashed convention used for every system-assigned value.
          fill ?? "border border-dashed border-border-strong",
        )}
      />
      {!swatchOnly && <span className="text-cell text-foreground">{text}</span>}
      {swatchOnly && <span className="sr-only">{text}</span>}
    </span>
  );
}
