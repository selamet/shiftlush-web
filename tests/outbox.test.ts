/**
 * The outbox: a visit typed in a machine room is never lost, and never
 * recorded twice.
 *
 * What these pin down is the decision made after each failed send — retry
 * later, or stop and ask a person — and that a retry resumes with the same
 * idempotency key and whatever the previous attempt already achieved. Getting
 * the first wrong either loses a technician's work or retries a refused form
 * forever; getting the second wrong records the visit twice.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import {
  addEntry,
  attemptEntry,
  classifyFailure,
  discardEntry,
  drainOutbox,
  listEntries,
  retryDelay,
  subscribe,
  type OutboxEntry,
  type Sender,
} from "@/lib/outbox";

const NOW = 1_800_000_000_000;

beforeEach(() => {
  // A fresh database per test; the module opens it by name on every call.
  globalThis.indexedDB = new IDBFactory();
});

function visit(id: string, userId = "user-1") {
  return {
    id,
    userId,
    kind: "maintenance-visit" as const,
    label: "Sol asansor",
    body: { elevator: "e-1", status: "completed" },
    photos: [],
  };
}

const offline = () => new ApiError({ code: "NETWORK_ERROR", status: 0 });
const refused = () =>
  new ApiError({ code: "VALIDATION_ERROR", status: 400, requestId: "req-9" });
const serverFault = () => new ApiError({ code: "INTERNAL_ERROR", status: 500 });
const inFlight = () => new ApiError({ code: "IDEMPOTENCY_KEY_IN_FLIGHT", status: 409, requestId: "req-7" });

describe("storing", () => {
  it("lists a user's entries oldest first, and nobody else's", async () => {
    await addEntry(visit("b"), NOW + 1);
    await addEntry(visit("a"), NOW);
    await addEntry(visit("x", "user-2"), NOW);

    const mine = await listEntries("user-1");

    expect(mine.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(mine[0]).toMatchObject({ state: "pending", attempts: 0, nextAttemptAt: NOW });
  });

  it("keeps a photo as a Blob", async () => {
    const blob = new Blob(["jpeg bytes"], { type: "image/jpeg" });
    await addEntry({ ...visit("a"), photos: [{ name: "p.jpg", type: "image/jpeg", blob }] });

    const [entry] = await listEntries("user-1");

    expect(entry.photos[0].name).toBe("p.jpg");
    expect(await entry.photos[0].blob.text()).toBe("jpeg bytes");
  });

  it("tells subscribers when something changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    await addEntry(visit("a"));
    await discardEntry("a");
    unsubscribe();
    await addEntry(visit("b"));

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("sending", () => {
  it("removes an entry once it is sent", async () => {
    await addEntry(visit("a"), NOW);
    const send = vi.fn<Sender>().mockResolvedValue();

    const result = await drainOutbox("user-1", send, NOW);

    expect(result).toEqual({ sent: 1, retrying: 0, refused: 0 });
    expect(send.mock.calls[0][0].id).toBe("a");
    expect(await listEntries("user-1")).toEqual([]);
  });

  it("never sends another user's entry", async () => {
    await addEntry(visit("theirs", "user-2"), NOW);
    const send = vi.fn<Sender>().mockResolvedValue();

    await drainOutbox("user-1", send, NOW);

    expect(send).not.toHaveBeenCalled();
    expect(await listEntries("user-2")).toHaveLength(1);
  });

  it("keeps an entry the network lost, and waits before trying it again", async () => {
    await addEntry(visit("a"), NOW);
    const send = vi.fn<Sender>().mockRejectedValue(offline());

    expect(await drainOutbox("user-1", send, NOW)).toEqual({
      sent: 0,
      retrying: 1,
      refused: 0,
    });
    const [entry] = await listEntries("user-1");
    expect(entry).toMatchObject({ state: "pending", attempts: 1, nextAttemptAt: NOW + 30_000 });

    // Not due yet: nothing is sent.
    await drainOutbox("user-1", send, NOW + 29_999);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries with the same idempotency key once it is due", async () => {
    await addEntry(visit("key-123"), NOW);
    const send = vi.fn<Sender>().mockRejectedValueOnce(offline()).mockResolvedValueOnce();

    await drainOutbox("user-1", send, NOW);
    await drainOutbox("user-1", send, NOW + 30_000);

    expect(send.mock.calls.map(([entry]) => entry.id)).toEqual(["key-123", "key-123"]);
    expect(await listEntries("user-1")).toEqual([]);
  });

  it("stops at a refusal and keeps the server's answer for a person to read", async () => {
    await addEntry(visit("a"), NOW);
    const send = vi.fn<Sender>().mockRejectedValue(refused());

    expect((await drainOutbox("user-1", send, NOW)).refused).toBe(1);
    const [entry] = await listEntries("user-1");
    expect(entry.state).toBe("needs-attention");
    expect(entry.error).toEqual({ code: "VALIDATION_ERROR", status: 400, requestId: "req-9" });

    // Never sent again on its own, however much time passes.
    await drainOutbox("user-1", send, NOW + 24 * 3600_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries a send whose first request is still in flight, with the same key and body", async () => {
    await addEntry(visit("key-456"), NOW);
    const send = vi.fn<Sender>().mockRejectedValueOnce(inFlight()).mockResolvedValueOnce();

    expect(await drainOutbox("user-1", send, NOW)).toEqual({ sent: 0, retrying: 1, refused: 0 });
    const [entry] = await listEntries("user-1");
    expect(entry).toMatchObject({ state: "pending", attempts: 1, nextAttemptAt: NOW + 30_000 });

    // The later answer — a 201, or the replay of the first one — clears it.
    expect((await drainOutbox("user-1", send, NOW + 30_000)).sent).toBe(1);
    expect(send.mock.calls.map(([sent]) => [sent.id, sent.body])).toEqual([
      ["key-456", visit("key-456").body],
      ["key-456", visit("key-456").body],
    ]);
    expect(await listEntries("user-1")).toEqual([]);
  });

  it("backs off further after each server fault", async () => {
    await addEntry(visit("a"), NOW);
    const send = vi.fn<Sender>().mockRejectedValue(serverFault());

    await drainOutbox("user-1", send, NOW);
    await drainOutbox("user-1", send, NOW + 30_000);

    const [entry] = await listEntries("user-1");
    expect(entry.attempts).toBe(2);
    expect(entry.nextAttemptAt).toBe(NOW + 30_000 + 60_000);
  });

  it("resumes from what the previous attempt already did", async () => {
    // The visit was created, then the photo upload lost the connection. The
    // retry must not create the visit again — it must pick up the photos.
    await addEntry(visit("a"), NOW);
    const seen: OutboxEntry["progress"][] = [];
    const send: Sender = async (entry, saveProgress) => {
      seen.push({ ...entry.progress });
      if (!entry.progress.recordId) {
        await saveProgress({ recordId: "visit-1", photosDone: 0 });
        throw offline();
      }
    };

    await drainOutbox("user-1", send, NOW);
    await drainOutbox("user-1", send, NOW + 30_000);

    expect(seen).toEqual([{ photosDone: 0 }, { recordId: "visit-1", photosDone: 0 }]);
  });

  it("does not try the rest of the queue when the connection is down", async () => {
    await addEntry(visit("a"), NOW);
    await addEntry(visit("b"), NOW + 1);
    const send = vi.fn<Sender>().mockRejectedValue(offline());

    await drainOutbox("user-1", send, NOW + 1);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("runs one drain at a time, however many are asked for", async () => {
    await addEntry(visit("a"), NOW);
    let release!: () => void;
    const send = vi.fn<Sender>(() => new Promise<void>((resolve) => (release = resolve)));

    const first = drainOutbox("user-1", send, NOW);
    const second = drainOutbox("user-1", send, NOW);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    release();

    expect(await first).toEqual(await second);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("a person pressing \"try now\"", () => {
  it("sends an entry that is still waiting out its back-off", async () => {
    await addEntry(visit("a"), NOW);
    await drainOutbox("user-1", () => Promise.reject(offline()), NOW);
    const send = vi.fn<Sender>().mockResolvedValue();

    // Ten seconds later: the timer would wait another twenty, the person won't.
    await drainOutbox("user-1", send, NOW + 10_000);
    expect(send).not.toHaveBeenCalled();
    await drainOutbox("user-1", send, NOW + 10_000, { ignoreBackoff: true });

    expect(send).toHaveBeenCalledTimes(1);
    expect(await listEntries("user-1")).toEqual([]);
  });

  it("still leaves an entry that needs attention to the person", async () => {
    await addEntry(visit("a"), NOW);
    await drainOutbox("user-1", () => Promise.reject(refused()), NOW);
    const send = vi.fn<Sender>().mockResolvedValue();

    await drainOutbox("user-1", send, NOW, { ignoreBackoff: true });

    expect(send).not.toHaveBeenCalled();
  });
});

describe("skipped photos", () => {
  it("are kept with the entry across a lost connection", async () => {
    await addEntry(visit("a"), NOW);
    await drainOutbox(
      "user-1",
      async (_, saveProgress) => {
        await saveProgress({ recordId: "visit-1", photosDone: 2, photosSkipped: ["big.jpg"] });
        throw offline();
      },
      NOW,
    );

    expect((await listEntries("user-1"))[0].progress).toEqual({
      recordId: "visit-1",
      photosDone: 2,
      photosSkipped: ["big.jpg"],
    });
  });

  it("are handed back with a sent entry, so the form can name them", async () => {
    const entry = await addEntry(visit("a"), NOW);

    const attempt = await attemptEntry(
      entry,
      async (_, saveProgress) => {
        await saveProgress({ recordId: "visit-1", photosDone: 1, photosSkipped: ["big.jpg"] });
      },
      NOW,
    );

    expect(attempt).toEqual({
      outcome: "sent",
      progress: { recordId: "visit-1", photosDone: 1, photosSkipped: ["big.jpg"] },
    });
  });
});

describe("attemptEntry — the form's own first try", () => {
  it("hands back what the sender saved, so the form can open the new record", async () => {
    const entry = await addEntry(visit("a"), NOW);
    const send: Sender = async (_, saveProgress) => {
      await saveProgress({ recordId: "visit-42", photosDone: 0 });
    };

    const attempt = await attemptEntry(entry, send, NOW);

    expect(attempt).toEqual({ outcome: "sent", progress: { recordId: "visit-42", photosDone: 0 } });
    expect(await listEntries("user-1")).toEqual([]);
  });

  it("leaves a lost send queued for the background to retry", async () => {
    const entry = await addEntry(visit("a"), NOW);

    const attempt = await attemptEntry(entry, () => Promise.reject(offline()), NOW);

    expect(attempt.outcome).toBe("queued");
    expect(await listEntries("user-1")).toMatchObject([{ state: "pending", attempts: 1 }]);
  });

  it("reports a refusal with the server's error, for the form to show", async () => {
    const entry = await addEntry(visit("a"), NOW);
    const error = refused();

    const attempt = await attemptEntry(entry, () => Promise.reject(error), NOW);

    expect(attempt).toEqual({ outcome: "refused", error });
  });
});

describe("a send that lost photos on the way (#99)", () => {
  const skippingSend: Sender = async (entry, saveProgress) => {
    await saveProgress({ ...entry.progress, recordId: "visit-7", photosSkipped: ["huge.heic"] });
  };

  it("keeps the entry as a note instead of deleting the only trace", async () => {
    const entry = await addEntry(visit("a"), NOW);

    const attempt = await attemptEntry(entry, skippingSend, NOW);

    expect(attempt.outcome).toBe("sent");
    const [kept] = await listEntries("user-1");
    expect(kept.state).toBe("delivered-with-gaps");
    expect(kept.progress).toMatchObject({ recordId: "visit-7", photosSkipped: ["huge.heic"] });
  });

  it("is never sent again by the drain", async () => {
    await addEntry(visit("a"), NOW);
    const send = vi.fn(skippingSend);

    await drainOutbox("user-1", send, NOW);
    await drainOutbox("user-1", send, NOW + 3600_000, { ignoreBackoff: true });

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("classifyFailure", () => {
  it.each([
    [offline(), "retry"],
    [serverFault(), "retry"],
    [new ApiError({ code: "THROTTLED", status: 429 }), "retry"],
    [inFlight(), "retry"],
    [refused(), "refuse"],
    [new ApiError({ code: "PERMISSION_DENIED", status: 403 }), "refuse"],
    [new ApiError({ code: "IDEMPOTENCY_KEY_REUSED", status: 409 }), "refuse"],
    [new ApiError({ code: "ELEVATOR_ALREADY_CONTRACTED", status: 409 }), "refuse"],
    [new TypeError("x is undefined"), "refuse"],
  ])("%o → %s", (error, expected) => {
    expect(classifyFailure(error)).toBe(expected);
  });
});

describe("retryDelay", () => {
  it("doubles from thirty seconds and stops at ten minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelay)).toEqual([
      30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000,
    ]);
  });
});
