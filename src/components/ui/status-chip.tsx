import * as React from "react";
import { CircleHelp, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { enumLabel, isUnknownEnum } from "@/lib/i18n";
import { useTranslation } from "react-i18next";

/**
 * Enum states are colourless on purpose.
 *
 * Colour in this system is reserved for inspection labels, which are *data*
 * (see InspectionLabel). Status is separated by weight and icon instead: the
 * expected value is silent so that scanning 500 rows stays fast, and the chip
 * gets heavier as the deviation gets more consequential.
 */
type ChipWeight =
  /** Expected state — renders as plain text, no chip. Most rows are this. */
  | "silent"
  /** Reversible deviation. */
  | "outline"
  /** Heaviest: legal or financial consequence, not undoable. */
  | "ink"
  /** On file but not operating. */
  | "recessed"
  /** Assigned by the system, not user-selectable. */
  | "dashed";

const weightClass: Record<Exclude<ChipWeight, "silent">, string> = {
  outline: "border border-border-strong text-foreground",
  ink: "bg-foreground text-background border border-transparent",
  recessed: "bg-muted text-muted-foreground border border-transparent",
  dashed: "border border-dashed border-border-strong text-muted-foreground",
};

interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  weight: ChipWeight;
  icon?: React.ComponentType<{ className?: string }>;
}

export function StatusChip({ weight, icon: Icon, className, children, ...props }: ChipProps) {
  if (weight === "silent") {
    return (
      <span className={cn("text-cell text-muted-foreground", className)} {...props}>
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-help font-medium whitespace-nowrap",
        weightClass[weight],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Weight alone carries the distinction; only `suspended` also takes an icon.
 *
 * An icon on every state would make the icon meaningless — it stops being a
 * signal and becomes decoration, and the weight scale it was meant to
 * reinforce gets harder to read at a glance across 500 rows.
 */
const ELEVATOR_STATUS: Record<string, { weight: ChipWeight; icon?: typeof Pause }> = {
  active: { weight: "silent" },
  suspended: { weight: "outline", icon: Pause },
  sealed: { weight: "ink" },
  out_of_service: { weight: "recessed" },
  uncontracted: { weight: "dashed" },
};

const CONTRACT_STATUS: Record<string, { weight: ChipWeight; icon?: typeof Pause }> = {
  draft: { weight: "dashed" },
  active: { weight: "silent" },
  expired: { weight: "outline" },
  terminated: { weight: "ink" },
  renewed: { weight: "recessed" },
};

function EnumChip({
  namespace,
  value,
  map,
}: {
  namespace: string;
  value: string;
  map: Record<string, { weight: ChipWeight; icon?: typeof Pause }>;
}) {
  if (isUnknownEnum(namespace, value)) return <UnknownEnumChip value={value} />;
  const spec = map[value] ?? { weight: "outline" as ChipWeight };
  return (
    <StatusChip weight={spec.weight} icon={spec.icon}>
      {enumLabel(namespace, value)}
    </StatusChip>
  );
}

export function ElevatorStatusChip({ value }: { value: string }) {
  return <EnumChip namespace="elevator.status" value={value} map={ELEVATOR_STATUS} />;
}

export function ContractStatusChip({ value }: { value: string }) {
  return <EnumChip namespace="contract.status" value={value} map={CONTRACT_STATUS} />;
}

/**
 * Roles carry no colour. Only `owner` is filled — there is exactly one per
 * company and it is the only role that can deactivate users. The other four
 * are equal weight: tinting them would imply a permission hierarchy that does
 * not exist, since their capabilities overlap rather than nest.
 */
export function RoleChip({ value }: { value: string }) {
  if (isUnknownEnum("user.role", value)) return <UnknownEnumChip value={value} />;
  return (
    <StatusChip weight={value === "owner" ? "ink" : "outline"}>
      {enumLabel("user.role", value)}
    </StatusChip>
  );
}

/**
 * The API may add enum values before this client ships a translation. The
 * fallback shows the raw code in mono inside a dashed frame with a question
 * mark — deliberately *not* in the error colour. There is nothing the user can
 * do about it, so alarming them would be noise. The visual language says
 * "not broken, just untranslated".
 */
export function UnknownEnumChip({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <span
      title={t("common.untranslatedValue")}
      className="inline-flex items-center gap-1 rounded-sm border border-dashed border-border-strong px-2 py-0.5 font-mono text-help text-muted-foreground whitespace-nowrap"
    >
      <CircleHelp className="size-3 shrink-0" aria-hidden="true" />
      {value}
    </span>
  );
}
