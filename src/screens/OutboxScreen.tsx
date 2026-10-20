import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { CloudUpload, ImageOff, Inbox, Loader2, Trash2, TriangleAlert, X } from "lucide-react";
import { ApiError, type ErrorCode } from "@/api/client";
import { errorMessage } from "@/api/errors";
import { discardEntry, drainOutbox, type DrainResult, type OutboxEntry } from "@/lib/outbox";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useOutboxEntries } from "@/lib/use-outbox";
import { cn } from "@/lib/utils";
import { useOutboxSender } from "@/components/outbox/Outbox";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusChip } from "@/components/ui/status-chip";

/** The last failure, in the sentence every other screen uses for that code. */
function lastError(entry: OutboxEntry, t: Parameters<typeof errorMessage>[1]): string {
  if (!entry.error) return "";
  return errorMessage(
    new ApiError({
      code: entry.error.code as ErrorCode,
      status: entry.error.status,
      requestId: entry.error.requestId,
    }),
    t,
  );
}

/**
 * What this device is holding for the signed-in person, and has not sent yet.
 *
 * Two kinds of row, and they are offered different things. A waiting entry is
 * the network's problem: it will go by itself, and "try now" is for the person
 * who can see the signal is back before the timer can. An entry that needs
 * attention is the server's answer — it read the visit and refused it — and
 * sending it again would get the same answer, so the only thing offered is to
 * discard it, with the server's reason beside it. The record is then entered
 * again from the elevator, where the form can say which field was wrong.
 *
 * A third kind arrived and lost photos on the way: the server refused them.
 * It is a note, not a task — the visit exists — so it links to the visit and
 * is dismissed without the heavy confirmation a waiting record needs.
 *
 * Read straight from this device's storage; there is nothing on the server to
 * fetch, which is also why every role gets the same screen.
 */
export function OutboxScreen() {
  const { t } = useTranslation();
  const { userId } = useSession();
  const entries = useOutboxEntries(userId);
  const send = useOutboxSender();
  const [pendingDiscard, setPendingDiscard] = useState<OutboxEntry | null>(null);
  const [draining, setDraining] = useState(false);
  const [result, setResult] = useState<DrainResult | null>(null);
  const [failure, setFailure] = useState("");

  const waiting = entries.filter((entry) => entry.state === "pending");

  async function tryNow() {
    if (!userId) return;
    setDraining(true);
    setResult(null);
    setFailure("");
    try {
      setResult(await drainOutbox(userId, send, Date.now(), { ignoreBackoff: true }));
    } catch (error) {
      // Storage itself failed, not a send — sends are recorded on the entry.
      setFailure(errorMessage(error, t));
    } finally {
      setDraining(false);
    }
  }

  async function discard(entry: OutboxEntry) {
    setPendingDiscard(null);
    setFailure("");
    try {
      await discardEntry(entry.id);
    } catch (error) {
      setFailure(errorMessage(error, t));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-title">{t("outbox.title")}</h1>
          <p className="text-help text-muted-foreground">{t("outbox.intro")}</p>
        </div>
        {waiting.length > 0 && (
          <Button size="lg" disabled={draining} onClick={() => void tryNow()}>
            {draining ? <Loader2 className="animate-spin" /> : <CloudUpload />}
            {draining ? t("outbox.sending") : t("outbox.tryNow")}
          </Button>
        )}
      </div>

      {failure && <Alert tone="error" block title={failure} />}
      {result && !draining && (
        <Alert tone={result.retrying > 0 || result.refused > 0 ? "warning" : "success"} block>
          {[
            result.sent > 0 && t("outbox.resultSent", { count: result.sent }),
            result.retrying > 0 && t("outbox.resultRetrying", { count: result.retrying }),
            result.refused > 0 && t("outbox.resultRefused", { count: result.refused }),
          ]
            .filter(Boolean)
            .join(" ") || t("outbox.resultNothing")}
        </Alert>
      )}

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <Inbox className="size-8 text-subtle" aria-hidden="true" />
          <p className="text-body text-muted-foreground">{t("outbox.empty")}</p>
          <p className="text-help text-subtle">{t("outbox.emptyHint")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => {
            if (entry.state === "delivered-with-gaps") {
              return (
                <DeliveredWithGaps
                  key={entry.id}
                  entry={entry}
                  onDismiss={() => void discard(entry)}
                />
              );
            }
            const attention = entry.state === "needs-attention";
            const message = lastError(entry, t);
            return (
              <li
                key={entry.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border bg-card p-4",
                  attention ? "border-warning" : "border-border-subtle",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col leading-tight">
                    <span className="text-cardtitle">{entry.label}</span>
                    <span className="text-help text-muted-foreground">
                      {t(`outbox.kind.${entry.kind}`)} ·{" "}
                      <span className="tnum">
                        {formatDateTime(new Date(entry.createdAt).toISOString())}
                      </span>
                      {entry.photos.length > 0 &&
                        ` · ${t("outbox.photoCount", { count: entry.photos.length })}`}
                    </span>
                  </div>
                  {attention ? (
                    <StatusChip weight="ink" icon={TriangleAlert}>
                      {t("outbox.state.needsAttention")}
                    </StatusChip>
                  ) : (
                    <StatusChip weight="outline">{t("outbox.state.pending")}</StatusChip>
                  )}
                </div>

                {attention ? (
                  <p className="text-body text-warning">
                    {message}
                    <span className="mt-1 block text-help text-muted-foreground">
                      {t("outbox.attentionHint")}
                    </span>
                  </p>
                ) : (
                  message && (
                    <p className="text-help text-muted-foreground">
                      {t("outbox.lastAttempt", { message, count: entry.attempts })}
                    </p>
                  )
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => setPendingDiscard(entry)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("outbox.discard")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Heavy: this is the only copy. A waiting visit has not reached the
          server, so once it is discarded here it exists nowhere at all. */}
      <ConfirmDialog
        open={pendingDiscard !== null}
        weight="heavy"
        title={t("outbox.discardTitle", { label: pendingDiscard?.label ?? "" })}
        body={t("outbox.discardBody")}
        consequences={[t("outbox.discardConsequence")]}
        confirmLabel={t("outbox.discard")}
        onConfirm={() => pendingDiscard && void discard(pendingDiscard)}
        onCancel={() => setPendingDiscard(null)}
      />
    </div>
  );
}

function DeliveredWithGaps({ entry, onDismiss }: { entry: OutboxEntry; onDismiss: () => void }) {
  const { t } = useTranslation();
  const skipped = entry.progress.photosSkipped ?? [];
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-warning bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-cardtitle">{entry.label}</span>
          <span className="tnum text-help text-muted-foreground">
            {formatDateTime(new Date(entry.createdAt).toISOString())}
          </span>
        </div>
        <StatusChip weight="ink" icon={ImageOff}>
          {t("outbox.state.deliveredWithGaps")}
        </StatusChip>
      </div>
      <p className="text-body text-warning">
        {t("outbox.photosSkipped", { count: skipped.length })} {skipped.join(", ")}
        <span className="mt-1 block text-help text-muted-foreground">
          {t("outbox.photosSkippedHint")}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {entry.progress.recordId && (
          <Link
            to="/maintenance-visits/$id"
            params={{ id: entry.progress.recordId }}
            className="text-body font-medium text-primary underline-offset-2 hover:underline focus-ring"
          >
            {t("outbox.openVisit")}
          </Link>
        )}
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          <X aria-hidden="true" />
          {t("outbox.dismiss")}
        </Button>
      </div>
    </li>
  );
}
