import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CloudUpload, TriangleAlert } from "lucide-react";
import { elevatorKeys, visitKeys, type MaintenanceVisitWrite } from "@/api/queries";
import type { Sender } from "@/lib/outbox";
import { useOutboxDriver, useOutboxEntries } from "@/lib/use-outbox";
import { sendVisit } from "@/lib/visit-outbox";
import { cn } from "@/lib/utils";

/**
 * The visit sender, plus the cache refresh a background send owes the screens.
 *
 * A visit the drain delivers while the technician is looking at the visit list
 * or the elevator it belongs to should appear there without a reload — the same
 * invalidation the form does on its own successful send.
 *
 * Memoised on the query client, which never changes: the driver restarts its
 * timer whenever the sender's identity changes, and a new function every render
 * would restart it on every render.
 */
export function useOutboxSender(): Sender {
  const queryClient = useQueryClient();
  return useCallback<Sender>(
    async (entry, saveProgress) => {
      await sendVisit(entry, saveProgress);
      const body = entry.body as MaintenanceVisitWrite;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: visitKeys.all }),
        queryClient.invalidateQueries({ queryKey: elevatorKeys.detail(body.elevator) }),
      ]);
    },
    [queryClient],
  );
}

/** Sends this user's waiting records in the background. Renders nothing. */
export function OutboxDriver({ userId }: { userId: string | null }) {
  useOutboxDriver(userId, useOutboxSender());
  return null;
}

/**
 * The topbar's note that something typed on this device has not arrived yet.
 *
 * Absent when nothing is waiting, which is almost always: a permanent "0
 * waiting" would be a control people learn to stop seeing, and the day it says
 * 1 it would be seen no more than it was the day before. When an entry has
 * been refused it takes the warning ink, because that one will not resolve
 * itself — a person has to open the list and decide.
 */
export function OutboxIndicator({ userId }: { userId: string | null }) {
  const { t } = useTranslation();
  const entries = useOutboxEntries(userId);
  if (entries.length === 0) return null;

  const refused = entries.some((entry) => entry.state === "needs-attention");
  const gaps = entries.filter((entry) => entry.state === "delivered-with-gaps").length;
  const waiting = entries.length - gaps;
  // A delivered visit with missing photos is not "waiting" — saying so would
  // send someone looking for a visit that already arrived.
  const attention = refused || gaps > 0;
  const label = refused
    ? t("outbox.indicatorAttention", { count: entries.length })
    : waiting > 0
      ? t("outbox.indicator", { count: waiting })
      : t("outbox.indicatorGaps", { count: gaps });
  const Icon = attention ? TriangleAlert : CloudUpload;

  return (
    <Link
      to="/outbox"
      aria-label={label}
      className={cn(
        "inline-flex h-control-sm items-center gap-1.5 rounded-md border px-2.5 text-help font-medium focus-ring pointer-coarse:h-control-md",
        attention
          ? "border-warning bg-warning-bg text-warning"
          : "border-border bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {/* The count alone on a phone, where the topbar has no room for the
          sentence; the link's name still says it in full. */}
      <span className="hidden sm:inline">{label}</span>
      <span className="tnum sm:hidden">{entries.length}</span>
    </Link>
  );
}
