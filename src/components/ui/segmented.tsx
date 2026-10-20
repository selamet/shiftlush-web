import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
  /**
   * How the segment looks once chosen. `warning` is for the answer that asks
   * somebody to act — it has to stand out in a column of sixteen rows read at
   * arm's length, and weight alone does not survive a dim machine room.
   */
  tone?: "default" | "warning";
}

interface SegmentedProps<Value extends string> {
  /** Groups the radios. Unique per control on the page, or two rows share one answer. */
  name: string;
  /** The question. Rendered, and used as the group's accessible name. */
  label: string;
  /** Drawn smaller and above the segments when false; hidden visually when true. */
  labelHidden?: boolean;
  options: readonly SegmentedOption<Value>[];
  /** `undefined` is "not answered yet", and nothing is drawn as chosen. */
  value: Value | undefined;
  onChange: (value: Value) => void;
  className?: string;
  /** For a caller that has to move focus here — "take me to the first unanswered row". */
  firstInputId?: string;
}

/**
 * A choice between a few answers, drawn as one bar of equal segments.
 *
 * Native radio inputs underneath, deliberately. The browser then supplies
 * everything a hand-rolled radiogroup has to reimplement and usually gets
 * wrong: arrow keys move and select within the group, Tab enters it once and
 * leaves it once, a screen reader announces "1 of 3", and no answer is chosen
 * until somebody chooses one. The inputs are visually hidden; the label around
 * each is the segment, so the whole segment is the tap target.
 *
 * Each segment is at least 44px tall — the mobile floor — because the person
 * using this is wearing gloves, and a target sized for a fingertip is one they
 * hit the neighbour of.
 */
export function Segmented<Value extends string>({
  name,
  label,
  labelHidden,
  options,
  value,
  onChange,
  className,
  firstInputId,
}: SegmentedProps<Value>) {
  const labelId = useId();

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      <span id={labelId} className={labelHidden ? "sr-only" : "text-label text-foreground"}>
        {label}
      </span>
      <div
        className="grid gap-1 rounded-lg border border-border bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option, index) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-control-lg cursor-pointer select-none items-center justify-center rounded-md px-2 py-1.5 text-center text-body leading-tight transition-colors",
                // The input is invisible, so its focus has to be drawn on the
                // segment — otherwise a keyboard user moving through sixteen
                // rows has no idea which one they are in.
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-background",
                checked
                  ? option.tone === "warning"
                    ? "border border-warning bg-warning-bg font-medium text-warning"
                    : "border border-border-strong bg-card font-medium text-foreground shadow-sm"
                  : "border border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <input
                type="radio"
                id={index === 0 ? firstInputId : undefined}
                className="sr-only"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
