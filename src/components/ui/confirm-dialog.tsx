import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Confirmations are graded, not uniform.
 *
 * Using one dialog for everything teaches the user to dismiss it without
 * reading, which is exactly the habit you do not want in front of a contract
 * termination. `normal` is a simple two-button prompt; `heavy` names the
 * consequences before offering the destructive action.
 */
type Weight = "normal" | "heavy";

interface ConfirmDialogProps {
  open: boolean;
  weight?: Weight;
  title: string;
  body?: string;
  /** Named consequences. Only rendered for `heavy`; each one is a real effect. */
  consequences?: string[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  weight = "normal",
  title,
  body,
  consequences,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40"
        onClick={onCancel}
        aria-label={t("common.close")}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-lg"
      >
        <div className="flex items-start gap-3">
          {weight === "heavy" && (
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive-bg">
              <TriangleAlert className="size-4 text-destructive" aria-hidden="true" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-cardtitle">{title}</h2>
            {body && <p className="text-body text-muted-foreground">{body}</p>}
          </div>
        </div>

        {weight === "heavy" && consequences && consequences.length > 0 && (
          <ul className="flex flex-col gap-1.5 rounded-md border-l-[3px] border-destructive bg-destructive-bg px-3 py-2.5">
            {consequences.map((item) => (
              <li key={item} className="text-help text-destructive">
                {item}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={weight === "heavy" ? "destructive" : "primary"}
            size="sm"
            onClick={onConfirm}
            className={cn(weight === "heavy" && "min-w-32")}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
