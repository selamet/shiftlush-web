import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Timer } from "lucide-react";
import type { Fault } from "@/api/queries";
import { formatDuration, responseSeconds } from "@/lib/faults";
import { cn } from "@/lib/utils";

/** How often a running time is redrawn. Minutes are the unit; a second hand would be noise. */
const TICK_MS = 30_000;

/**
 * How long a fault has waited for a technician, running until one arrives.
 *
 * Each timer keeps its own clock rather than the board refetching to move the
 * number: the elapsed time is arithmetic on a timestamp the row already has,
 * and asking the server every thirty seconds for that would be a request per
 * tick for nothing it does not already know.
 */
export function ResponseTimer({
  fault,
  className,
}: {
  fault: Pick<Fault, "reported_at" | "on_site_at" | "response_time_seconds" | "status">;
  className?: string;
}) {
  const { t } = useTranslation();
  const running = fault.response_time_seconds === null && fault.status !== "cancelled";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  const seconds = responseSeconds(fault, now);
  if (seconds === null) return <span className={cn("text-subtle", className)}>—</span>;

  return (
    <span
      className={cn("inline-flex items-center gap-1 tnum whitespace-nowrap", className)}
      title={running ? t("fault.responseRunning") : t("fault.responseFinal")}
    >
      {running && <Timer className="size-3.5 shrink-0" aria-hidden="true" />}
      {formatDuration(seconds, t)}
    </span>
  );
}
