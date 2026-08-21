import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Row height is 40px with a two-line cell — the measured decision from the
 * design phase.
 *
 * The 32px "compact" variant was rejected: at that height the secondary line
 * has nowhere to go, so building+customer and brand+model each need their own
 * column, taking the table from 7 columns to 12 and reintroducing horizontal
 * scroll. A 28px in-row action also cannot carry a 40px hit target.
 *
 * Tables are flat. Elevation is reserved for things that float above the page.
 */

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-cell", className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-border bg-background", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("", className)} {...props} />;
}

export function TableRow({
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      data-selected={selected || undefined}
      className={cn(
        "h-control-md border-b border-border-subtle transition-colors",
        "hover:bg-muted data-[selected]:bg-selected",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 px-3 text-left text-colhead uppercase text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn("px-3 py-1.5 align-middle", numeric && "tnum text-right", className)}
      {...props}
    />
  );
}

/**
 * The two-line cell the 40px row exists for: identifier on top, the context
 * that would otherwise need its own column underneath.
 */
export function TableCellStacked({
  primary,
  secondary,
  mono,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col justify-center leading-tight">
      <span className={cn("text-cell text-foreground", mono && "font-mono tnum")}>
        {primary}
      </span>
      {secondary && (
        <span className="text-help text-muted-foreground truncate">{secondary}</span>
      )}
    </div>
  );
}
