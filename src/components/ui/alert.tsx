import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * System status: pale surface + dark ink + icon. Never a saturated fill, and
 * never inside a data cell — that weight and that position belong to the
 * inspection label (see InspectionLabel).
 */
type Tone = "success" | "info" | "warning" | "error";

const toneClass: Record<Tone, string> = {
  success: "bg-success-bg text-success border-success",
  info: "bg-info-bg text-info border-info",
  warning: "bg-warning-bg text-warning border-warning",
  error: "bg-destructive-bg text-destructive border-destructive",
};

const toneIcon: Record<Tone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
  error: CircleX,
};

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone: Tone;
  title?: string;
  /**
   * Stretches to the container. Correct for form-level errors, where the block
   * should line up with the fields it refers to.
   *
   * Off by default: a one-line notice stretched across a 1400px content area
   * reads as a filled band rather than a deliberate marker, and the emphasis
   * ends up coming from sheer area instead of from the design.
   */
  block?: boolean;
}

export function Alert({ tone, title, block, className, children, ...props }: AlertProps) {
  const Icon = toneIcon[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        // 3px left stripe: border weight is meaningful here, not decorative.
        "flex items-start gap-2.5 rounded-md border-l-[3px] py-2 pl-2.5 pr-3.5 text-body",
        block ? "w-full" : "w-fit max-w-full",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}
