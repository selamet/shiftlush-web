import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }
>(({ className, children, required, ...props }, ref) => (
  <label ref={ref} className={cn("text-label text-foreground", className)} {...props}>
    {children}
    {required && (
      <span aria-hidden="true" className="ml-0.5 text-destructive">
        *
      </span>
    )}
  </label>
));
Label.displayName = "Label";

/**
 * A field in error carries a 1.5px border, not a colour swap — border weight
 * is meaningful in this system and the error state has to survive in dark
 * theme where a red tint alone reads as noise.
 */
export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "h-control-md w-full rounded-md border border-input bg-card px-3 text-body text-foreground",
      "placeholder:text-subtle focus-ring transition-colors",
      "hover:border-border-strong",
      "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
      "read-only:bg-muted read-only:text-muted-foreground",
      "pointer-coarse:h-control-lg",
      invalid && "border-[1.5px] border-destructive hover:border-destructive",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, rows = 3, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    aria-invalid={invalid || undefined}
    className={cn(
      "w-full rounded-md border border-input bg-card px-3 py-2 text-body text-foreground",
      "placeholder:text-subtle focus-ring transition-colors hover:border-border-strong",
      invalid && "border-[1.5px] border-destructive hover:border-destructive",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  /** Shown while the field is valid; replaced by the error, never stacked. */
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * Set false when the child is a wrapper rather than the control itself (an
   * input with an adornment, a textarea with a counter). Field would otherwise
   * put `htmlFor` on the wrapper and the page would carry a duplicate id, which
   * silently breaks the label association. The caller sets the id instead.
   */
  bindChild?: boolean;
}

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
  bindChild = true,
}: FieldProps) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {bindChild && React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id: htmlFor,
            "aria-describedby": describedBy,
          })
        : children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="flex items-center gap-1.5 text-help text-destructive"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-help text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
