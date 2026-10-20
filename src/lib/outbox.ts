/**
 * Records a technician submitted that have not reached the server yet.
 *
 * A machine room is where the connection drops, and it drops at the exact
 * moment somebody taps "save" on a form they spent ten minutes filling in. So a
 * submission is written here first and sent second: if the send fails, nothing
 * typed is lost, and the outbox tries again when the connection comes back.
 *
 * Three rules carry the design.
 *
 * - **The entry's id is its idempotency key.** Every retry sends the same key,
 *   so a retry of a request that did reach the server — the response was what
 *   got lost — is answered with the stored result instead of recording the
 *   visit twice. That is the only reason sending "again" is safe at all.
 * - **A refusal is not retried.** A 4xx means the server read the request and
 *   said no; sending it again says nothing new. The entry is kept and marked
 *   as needing attention, with the server's answer, so a person decides — a
 *   form the server rejects is never retried forever in silence.
 * - **Entries belong to the user who made them.** They are listed and sent
 *   only for that user. A shared phone signed into by somebody else does not
 *   send the first person's records under the second person's name.
 *
 * Storage is IndexedDB rather than localStorage because an entry carries
 * photos, which are Blobs, and localStorage holds only strings and a few
 * megabytes of them.
 */
import { ApiError } from "@/api/client";

export type OutboxKind = "maintenance-visit";

/**
 * `delivered-with-gaps`: the record reached the server, but the server refused
 * some of its photos. Nothing is left to send; the entry stays only so the
 * person who took those photos is told, until they dismiss it (#99).
 */
export type OutboxState = "pending" | "needs-attention" | "delivered-with-gaps";

export interface OutboxPhoto {
  name: string;
  type: string;
  blob: Blob;
}

export interface OutboxEntry<TBody = unknown> {
  /** The idempotency key the request is sent with, on every attempt. */
  id: string;
  userId: string;
  kind: OutboxKind;
  /** What a list of waiting entries shows, e.g. the elevator's name. */
  label: string;
  body: TBody;
  photos: OutboxPhoto[];
  createdAt: number;
  state: OutboxState;
  attempts: number;
  /** Not sent before this time (ms since epoch). The back-off lives here. */
  nextAttemptAt: number;
  /** The last failure, for the person reading the list. */
  error?: { code: string; status: number; requestId: string };
  /**
   * What earlier attempts already achieved, so the next one resumes rather
   * than repeats: the record that was created, and how many photos went up.
   */
  progress: OutboxProgress;
}

export interface OutboxProgress {
  recordId?: string;
  /** Photos dealt with so far, in order: sent, or skipped below. */
  photosDone: number;
  /**
   * Names of photos the server refused outright — too large, a type it does
   * not take. Skipped rather than retried, because sending the same file again
   * gets the same answer, and a photo must never hold the visit it belongs to
   * hostage. Kept so the person can be told which ones did not make it.
   */
  photosSkipped?: string[];
}

export type NewOutboxEntry<TBody> = Pick<
  OutboxEntry<TBody>,
  "id" | "userId" | "kind" | "label" | "body" | "photos"
>;

const DB_NAME = "shiftlush-outbox";
const STORE = "entries";

// ---------------------------------------------------------------------------
// Storage

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("userId", "userId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      // Resolved on the transaction, not the request: a write is not durable
      // until its transaction completes, and "saved" has to mean saved.
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function addEntry<TBody>(entry: NewOutboxEntry<TBody>, now = Date.now()) {
  const full: OutboxEntry<TBody> = {
    ...entry,
    createdAt: now,
    state: "pending",
    attempts: 0,
    nextAttemptAt: now,
    progress: { photosDone: 0 },
  };
  await run("readwrite", (store) => store.put(full));
  notify();
  return full;
}

export async function listEntries(userId: string): Promise<OutboxEntry[]> {
  const rows = await run("readonly", (store) =>
    store.index("userId").getAll(IDBKeyRange.only(userId)),
  );
  return (rows as OutboxEntry[]).sort((a, b) => a.createdAt - b.createdAt);
}

async function saveEntry(entry: OutboxEntry) {
  await run("readwrite", (store) => store.put(entry));
  notify();
}

export async function discardEntry(id: string) {
  await run("readwrite", (store) => store.delete(id));
  notify();
}

// ---------------------------------------------------------------------------
// Change notification — so a counter in the shell updates when a send lands.

const listeners = new Set<() => void>();
const channel =
  typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(DB_NAME);
channel?.addEventListener("message", () => listeners.forEach((listener) => listener()));

function notify() {
  listeners.forEach((listener) => listener());
  // Another tab of the app shows the same counter.
  channel?.postMessage("changed");
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---------------------------------------------------------------------------
// Sending

/**
 * Whether a failed send is worth trying again.
 *
 * Retried: no connection (status 0), a server fault (5xx), and a throttle (429)
 * — each of those says nothing about the request and may well pass later.
 * Refused: every other 4xx, where the server read the request and decided.
 * Anything that is not an ApiError is a bug in the sending code rather than
 * the network, and retrying a bug forever helps nobody, so it is refused too.
 */
export function classifyFailure(error: unknown): "retry" | "refuse" {
  if (!(error instanceof ApiError)) return "refuse";
  if (error.status === 0 || error.status === 429 || error.status >= 500) return "retry";
  return "refuse";
}

const FIRST_DELAY_MS = 30_000;
const MAX_DELAY_MS = 10 * 60_000;

/** 30 s, 1 min, 2 min, … capped at 10 min, by number of failed attempts. */
export function retryDelay(attempts: number): number {
  return Math.min(FIRST_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

export type Sender = (
  entry: OutboxEntry,
  saveProgress: (progress: OutboxProgress) => Promise<void>,
) => Promise<void>;

export interface DrainResult {
  sent: number;
  retrying: number;
  refused: number;
}

export interface DrainOptions {
  /**
   * Send entries still waiting out their back-off. For a person pressing "try
   * now": they can see the signal is back, and the timer cannot.
   */
  ignoreBackoff?: boolean;
}

let running: Promise<DrainResult> | null = null;

/**
 * Send this user's due entries, oldest first, one at a time.
 *
 * Only one drain runs at once: the `online` event, the timer and a fresh
 * submission can all ask for one within the same second, and two drains
 * sending the same entry in parallel would race each other's progress.
 * A caller that arrives while one is running gets that one's result.
 */
export function drainOutbox(
  userId: string,
  send: Sender,
  now = Date.now(),
  options: DrainOptions = {},
): Promise<DrainResult> {
  running ??= drain(userId, send, now, options).finally(() => {
    running = null;
  });
  return running;
}

export type Attempt =
  | { outcome: "sent"; progress: OutboxProgress }
  | { outcome: "queued"; error: unknown }
  | { outcome: "refused"; error: unknown };

/**
 * One send of one entry, and what it leaves behind.
 *
 * Sent: the entry is removed, and the progress the sender saved — the id of
 * the record it created — is handed back. If the sender had to skip photos the
 * server refused, the entry is kept as `delivered-with-gaps` instead: a send
 * the drain made in the background has nobody watching it, and deleting the
 * entry would delete the only trace that a photo never arrived. Queued: the failure was the network
 * or the server, so the entry waits for its back-off. Refused: the server said
 * no, and the entry is marked as needing attention.
 *
 * The visit form calls this directly for the first attempt, so a person still
 * looking at the form hears about a refusal next to the field that caused it;
 * it then discards the entry itself, because the form, not the outbox, is
 * where that person fixes it. Every later attempt comes from `drainOutbox`.
 */
export async function attemptEntry(
  entry: OutboxEntry,
  send: Sender,
  now = Date.now(),
): Promise<Attempt> {
  const saveProgress = async (progress: OutboxProgress) => {
    entry.progress = progress;
    await saveEntry(entry);
  };
  try {
    await send(entry, saveProgress);
    if (entry.progress.photosSkipped?.length) {
      entry.state = "delivered-with-gaps";
      await saveEntry(entry);
    } else {
      await discardEntry(entry.id);
    }
    return { outcome: "sent", progress: entry.progress };
  } catch (error) {
    entry.attempts += 1;
    entry.error =
      error instanceof ApiError
        ? { code: error.code, status: error.status, requestId: error.requestId }
        : { code: "UNKNOWN_ERROR", status: 0, requestId: "" };
    const retry = classifyFailure(error) === "retry";
    if (retry) {
      entry.nextAttemptAt = now + retryDelay(entry.attempts);
    } else {
      entry.state = "needs-attention";
    }
    await saveEntry(entry);
    return retry ? { outcome: "queued", error } : { outcome: "refused", error };
  }
}

async function drain(
  userId: string,
  send: Sender,
  now: number,
  options: DrainOptions,
): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, retrying: 0, refused: 0 };
  const due = (await listEntries(userId)).filter(
    (entry) =>
      entry.state === "pending" && (options.ignoreBackoff || entry.nextAttemptAt <= now),
  );

  for (const entry of due) {
    const attempt = await attemptEntry(entry, send, now);
    if (attempt.outcome === "sent") {
      result.sent += 1;
      continue;
    }
    if (attempt.outcome === "refused") {
      result.refused += 1;
      continue;
    }
    result.retrying += 1;
    // A network failure on one entry is a network failure on all of them;
    // trying the rest now would only spend the same timeout again.
    if (attempt.error instanceof ApiError && attempt.error.status === 0) break;
  }
  return result;
}
