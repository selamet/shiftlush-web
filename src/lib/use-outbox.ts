/**
 * The outbox, as React sees it: what is waiting, and the loop that sends it.
 *
 * Kept apart from outbox.ts so that file stays free of React and can be tested
 * as plain functions under Node; nothing here holds logic worth testing on its
 * own — it subscribes, it lists, it calls `drainOutbox` at the right moments.
 */
import { useEffect, useState } from "react";
import { drainOutbox, listEntries, subscribe, type OutboxEntry, type Sender } from "@/lib/outbox";

/** This user's waiting entries, kept current as sends land or fail. */
export function useOutboxEntries(userId: string | null): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  useEffect(() => {
    if (!userId || typeof indexedDB === "undefined") {
      setEntries([]);
      return;
    }
    let live = true;
    const refresh = () => {
      listEntries(userId)
        .then((rows) => {
          if (live) setEntries(rows);
        })
        // A browser with storage disabled (private mode on some phones) has no
        // outbox to show; that is not an error the shell should surface.
        .catch(() => undefined);
    };
    refresh();
    const unsubscribe = subscribe(refresh);
    return () => {
      live = false;
      unsubscribe();
    };
  }, [userId]);

  return entries;
}

const RETRY_TICK_MS = 30_000;

/**
 * Sends this user's waiting entries whenever there is a reason to think it
 * might now work: on mount (the session has just been restored), when the
 * browser says it is back online, and every thirty seconds while mounted —
 * `online` is a hint, not a promise, and a phone that switched towers without
 * going "offline" never fires it.
 *
 * Mounted once, inside the signed-in shell, so a drain only ever runs with a
 * session to send under. The user id is what scopes it: a different person
 * signing in on the same device drains their own entries and nobody else's.
 */
export function useOutboxDriver(userId: string | null, send: Sender) {
  useEffect(() => {
    if (!userId || typeof indexedDB === "undefined") return;
    const drain = () => {
      drainOutbox(userId, send).catch(() => undefined);
    };
    drain();
    window.addEventListener("online", drain);
    const timer = window.setInterval(drain, RETRY_TICK_MS);
    return () => {
      window.removeEventListener("online", drain);
      window.clearInterval(timer);
    };
  }, [userId, send]);
}
