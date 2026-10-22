/**
 * Sending a visit out of the outbox, and picking up where the last try stopped.
 *
 * The network is mocked at the two calls the sender makes — the create and the
 * photo upload — because what is under test is the order of those calls, the
 * keys they carry and what is remembered between attempts. Getting the keys
 * wrong records the visit twice; getting the resume wrong uploads a photo twice
 * or never; treating a refused photo as a network failure parks the visit
 * forever behind one file the server will never accept.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import type { OutboxProgress } from "@/lib/outbox";

vi.mock("@/api/queries", () => ({ createVisit: vi.fn() }));
vi.mock("@/lib/upload", async (original) => ({
  ...(await original<typeof import("@/lib/upload")>()),
  uploadAttachment: vi.fn(),
}));

const { createVisit } = await import("@/api/queries");
const { uploadAttachment, UploadError } = await import("@/lib/upload");
const { classifyFailure } = await import("@/lib/outbox");
const { photoFailure, photoIdempotencyKey, sendVisit } = await import("@/lib/visit-outbox");

const create = vi.mocked(createVisit);
const upload = vi.mocked(uploadAttachment);

const offline = () => new ApiError({ code: "NETWORK_ERROR", status: 0 });
const tooLarge = () => new ApiError({ code: "FILE_TOO_LARGE", status: 400 });

function photo(name: string) {
  return { name, type: "image/jpeg", blob: new Blob(["x"], { type: "image/jpeg" }) };
}

function entry(progress: OutboxProgress = { photosDone: 0 }, photos = [photo("a.jpg"), photo("b.jpg")]) {
  return {
    id: "key-1",
    userId: "u3",
    kind: "maintenance-visit" as const,
    label: "Sol asansor",
    body: { elevator: "e1", contract: "k1", visit_date: "2026-10-20", status: "completed" as const },
    photos,
    createdAt: 0,
    state: "pending" as const,
    attempts: 0,
    nextAttemptAt: 0,
    progress,
  };
}

/** Records every save, and applies it to the entry the way the outbox does. */
function recorder(target: { progress: OutboxProgress }) {
  const saved: OutboxProgress[] = [];
  const save = async (progress: OutboxProgress) => {
    saved.push(progress);
    target.progress = progress;
  };
  return { saved, save };
}

beforeEach(() => {
  create.mockReset();
  upload.mockReset();
  create.mockResolvedValue({ id: "visit-1" } as never);
  upload.mockResolvedValue({} as never);
});

describe("a first attempt", () => {
  it("creates the visit under the entry's own key, then sends every photo under its own", async () => {
    const one = entry();
    const { saved, save } = recorder(one);

    await sendVisit(one, save);

    expect(create).toHaveBeenCalledWith(one.body, "key-1");
    expect(upload.mock.calls.map(([options]) => [options.objectId, options.idempotencyKey])).toEqual(
      [
        ["visit-1", "key-1:photo:0"],
        ["visit-1", "key-1:photo:1"],
      ],
    );
    expect(upload.mock.calls[0][0]).toMatchObject({
      objectType: "maintenance_visit",
      category: "photo",
    });
    expect(saved).toEqual([
      { recordId: "visit-1", photosDone: 0 },
      { recordId: "visit-1", photosDone: 1 },
      { recordId: "visit-1", photosDone: 2 },
    ]);
  });

  it("saves nothing when the visit itself is refused, and says so as the server did", async () => {
    const refusal = new ApiError({ code: "VALIDATION_ERROR", status: 400 });
    create.mockRejectedValue(refusal);
    const one = entry();
    const { saved, save } = recorder(one);

    await expect(sendVisit(one, save)).rejects.toBe(refusal);
    expect(saved).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("a resumed attempt", () => {
  it("never creates the visit again once there is a record id", async () => {
    const one = entry({ recordId: "visit-1", photosDone: 1 });
    const { save } = recorder(one);

    await sendVisit(one, save);

    expect(create).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0].idempotencyKey).toBe("key-1:photo:1");
  });

  it("stops at a photo the connection lost, and starts from that photo next time", async () => {
    upload.mockResolvedValueOnce({} as never).mockRejectedValueOnce(offline());
    const one = entry();
    const first = recorder(one);

    const error = await sendVisit(one, first.save).catch((thrown: unknown) => thrown);
    expect(classifyFailure(error)).toBe("retry");
    expect(one.progress).toEqual({ recordId: "visit-1", photosDone: 1 });

    upload.mockReset();
    upload.mockResolvedValue({} as never);
    await sendVisit(one, recorder(one).save);

    expect(create).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls.map(([options]) => options.idempotencyKey)).toEqual([
      "key-1:photo:1",
    ]);
    expect(one.progress).toEqual({ recordId: "visit-1", photosDone: 2 });
  });

  it("does nothing at all when everything was already done", async () => {
    const one = entry({ recordId: "visit-1", photosDone: 2 });
    const { saved, save } = recorder(one);

    await sendVisit(one, save);

    expect(create).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });
});

describe("a photo the server refuses", () => {
  it("is skipped by name and the rest still go", async () => {
    upload.mockRejectedValueOnce(tooLarge()).mockResolvedValueOnce({} as never);
    const one = entry();
    const { save } = recorder(one);

    await sendVisit(one, save);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(one.progress).toEqual({
      recordId: "visit-1",
      photosDone: 2,
      photosSkipped: ["a.jpg"],
    });
  });

  it("stays skipped when a later photo then loses the connection", async () => {
    upload.mockRejectedValueOnce(tooLarge()).mockRejectedValueOnce(offline());
    const one = entry();

    await expect(sendVisit(one, recorder(one).save)).rejects.toBeInstanceOf(ApiError);

    expect(one.progress).toEqual({ recordId: "visit-1", photosDone: 1, photosSkipped: ["a.jpg"] });
  });
});

describe("photoFailure", () => {
  it("retries the connection, a server fault, a throttle and an expired signature", () => {
    expect(photoFailure(offline())).toBe("retry");
    expect(photoFailure(new ApiError({ code: "INTERNAL_ERROR", status: 500 }))).toBe("retry");
    expect(photoFailure(new ApiError({ code: "THROTTLED", status: 429 }))).toBe("retry");
    expect(photoFailure(new UploadError("expired", 403))).toBe("retry");
    expect(photoFailure(new UploadError("network"))).toBe("retry");
    expect(photoFailure(new UploadError("rejected", 503))).toBe("retry");
  });

  it("skips what the server or the bucket refused outright", () => {
    expect(photoFailure(tooLarge())).toBe("skip");
    expect(photoFailure(new ApiError({ code: "UNSUPPORTED_MIME_TYPE", status: 400 }))).toBe("skip");
    expect(photoFailure(new UploadError("rejected", 400))).toBe("skip");
  });

  it("turns a lost bucket transfer into a failure the outbox will retry", async () => {
    upload.mockRejectedValueOnce(new UploadError("network"));
    const one = entry();

    const error = await sendVisit(one, recorder(one).save).catch((thrown: unknown) => thrown);

    expect(classifyFailure(error)).toBe("retry");
    expect(one.progress.photosDone).toBe(0);
  });
});

describe("photoIdempotencyKey", () => {
  it("is the same for the same photo of the same entry, every time", () => {
    expect(photoIdempotencyKey("key-1", 3)).toBe("key-1:photo:3");
    expect(photoIdempotencyKey("key-1", 3)).toBe(photoIdempotencyKey("key-1", 3));
  });
});

describe("the building's signature", () => {
  const signature = () => ({
    name: "imza.png",
    type: "image/png",
    blob: new Blob(["x"], { type: "image/png" }),
    category: "signature" as const,
  });

  it("goes up under its own category, after the photos", async () => {
    const one = entry({ photosDone: 0 }, [photo("a.jpg"), signature()]);
    await sendVisit(one, recorder(one).save);
    expect(upload.mock.calls.map(([options]) => options.category)).toEqual(["photo", "signature"]);
  });

  it("counts a signature the server already has as sent, not skipped", async () => {
    const one = entry({ photosDone: 0, recordId: "visit-1" }, [signature()]);
    upload.mockRejectedValueOnce(new ApiError({ code: "SIGNATURE_EXISTS", status: 409 }));
    await sendVisit(one, recorder(one).save);
    expect(one.progress.photosDone).toBe(1);
    expect(one.progress.photosSkipped ?? []).toEqual([]);
  });

  it("still waits for the connection like any photo", async () => {
    const one = entry({ photosDone: 0, recordId: "visit-1" }, [signature()]);
    upload.mockRejectedValueOnce(offline());
    await expect(sendVisit(one, recorder(one).save)).rejects.toBeInstanceOf(ApiError);
    expect(one.progress.photosDone).toBe(0);
  });
});
