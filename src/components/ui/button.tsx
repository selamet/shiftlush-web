import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Widths are sized against the longest real Turkish label rather than its
 * English equivalent: Turkish runs about 20% longer, and the destructive
 * actions in this product carry the longest labels of all. They must not
 * truncate.
 *
 * Every size steps up one notch under `pointer: coarse`: the technician uses
 * this with gloves on, and 34px is not reachable that way.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:
          "border border-border bg-card text-foreground hover:bg-muted hover:border-border-strong",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary-hover",
      },
      size: {
        /** In-row action. Visually small, but `hit-40` gives it a 40x40 target. */
        xs: "hit-40 h-control-xs rounded-sm px-2 text-help [&_svg]:size-3.5 pointer-coarse:h-control-sm",
        /** Desktop default. */
        sm: "h-control-sm px-3 text-body [&_svg]:size-4 pointer-coarse:h-control-md",
        /** Dense form context and search. */
        md: "h-control-md px-4 text-body [&_svg]:size-4 pointer-coarse:h-control-lg",
        /** Mobile floor — WCAG 2.5.5. */
        lg: "h-control-lg px-5 text-body [&_svg]:size-[18px] pointer-coarse:h-control-xl",
        /** Gloved primary action in the field. */
        xl: "h-control-xl px-6 text-cardtitle [&_svg]:size-5",
        /** Square icon-only button, matched to the sm row height. */
        icon: "h-control-sm w-control-sm [&_svg]:size-4 pointer-coarse:h-control-md pointer-coarse:w-control-md",
        iconXs: "hit-40 h-control-xs w-control-xs rounded-sm [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
