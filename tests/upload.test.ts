/**
 * What the person who just took a photo of an inspection report is told when
 * the file does not arrive.
 *
 * `putSignedFile` reduces every way a transfer can end to one of four reasons,
 * and the screen decides what to say from that reason alone: `expired` means
 * ask for a new URL and try again, `cancelled` means say nothing at all,
 * `network` means the connection, `rejected` means something is wrong with the
 * request itself. Getting the mapping wrong tells a technician with a bad
 * signal that their file was refused, or silently swallows a real refusal.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { UploadError, putSignedFile } from "@/lib/upload";
import { thrown } from "./support";

interface ProgressEvent {
  lengthComputable: boolean;
  loaded: number;
  total: number;
}

/**
 * XMLHttpRequest, reduced to what upload.ts touches.
 *
 * A fake rather than jsdom: the transfer is driven entirely by the four
 * callbacks below, and being able to fire them one at a time — a progress event
 * *after* the response, an abort on a request that was never sent — is the only
 * way to reach the branches that matter.
 */
class FakeXhr {
  static created: FakeXhr[] = [];

  status = 0;
  withCredentials = true;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  sent: unknown = null;
  aborted = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.created.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: unknown): void {
    this.sent = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  progress(loaded: number, total: number, lengthComputable = true): void {
    this.upload.onprogress?.({ lengthComputable, loaded, total });
  }

  respond(status: number): void {
    this.status = status;
    this.onload?.();
  }
}

globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;

const SIGNED_URL = "https://bucket.example.com/attachments/a1?X-Amz-Signature=abc";

function upload(options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}) {
  const file = new File(["inspection report bytes"], "report.pdf", { type: "application/pdf" });
  const promise = putSignedFile({
    url: SIGNED_URL,
    file,
    contentType: "application/pdf",
    ...options,
  });
  return { promise, xhr: FakeXhr.created.at(-1) as FakeXhr, file };
}

beforeEach(() => {
  FakeXhr.created = [];
});

describe("a transfer that works", () => {
  it("PUTs the file to the signed URL and sends nothing of ours", async () => {
    const { promise, xhr, file } = upload();

    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe(SIGNED_URL);
    expect(xhr.sent).toBe(file);
    // The signature covers the content type. A helpful guess would void it.
    expect(xhr.headers["Content-Type"]).toBe("application/pdf");
    // Our session cookie has no business at somebody else's origin, and sending
    // it fails the preflight on the way out.
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.headers.Authorization).toBeUndefined();

    xhr.respond(200);
    await expect(promise).resolves.toBeUndefined();
  });

  it("finishes the bar at exactly 1, whatever the last progress event said", async () => {
    // The last progress event can arrive before the response does, so the bar
    // would otherwise sit at 98% on a file that is already there.
    const fractions: number[] = [];
    const { promise, xhr } = upload({ onProgress: (f) => fractions.push(f) });

    xhr.progress(5, 10);
    xhr.progress(980, 1000);
    xhr.respond(204);
    await promise;

    expect(fractions).toEqual([0.5, 0.98, 1]);
  });

  it("ignores a progress event whose total the browser does not know", async () => {
    const fractions: number[] = [];
    const { promise, xhr } = upload({ onProgress: (f) => fractions.push(f) });

    xhr.progress(0, 0, false);
    xhr.respond(201);
    await promise;

    expect(fractions).toEqual([1]);
  });
});

describe("a transfer that does not", () => {
  it("calls a 403 expired, because that is what it almost always is", async () => {
    // R2 answers an expired signature and a malformed one alike with 403. They
    // are indistinguishable from here and both are fixed the same way.
    const { promise, xhr } = upload();
    xhr.respond(403);

    const error = (await thrown(() => promise)) as UploadError;

    expect(error).toBeInstanceOf(UploadError);
    expect(error.reason).toBe("expired");
    expect(error.status).toBe(403);
  });

  it("calls any other refusal rejected, and keeps the status", async () => {
    const { promise, xhr } = upload();
    xhr.respond(500);

    const error = (await thrown(() => promise)) as UploadError;

    expect(error.reason).toBe("rejected");
    expect(error.status).toBe(500);
  });

  it("calls a 400 rejected rather than expired", async () => {
    const { promise, xhr } = upload();
    xhr.respond(400);

    expect(((await thrown(() => promise)) as UploadError).reason).toBe("rejected");
  });

  it("calls a dead connection network", async () => {
    const { promise, xhr } = upload();
    xhr.onerror?.();

    const error = (await thrown(() => promise)) as UploadError;

    expect(error.reason).toBe("network");
    expect(error.status).toBe(0);
  });

  it("calls a timeout network too, because to the person waiting it is one", async () => {
    const { promise, xhr } = upload();
    xhr.ontimeout?.();

    expect(((await thrown(() => promise)) as UploadError).reason).toBe("network");
  });
});

describe("a transfer the user called off", () => {
  it("calls a transport abort cancelled", async () => {
    const { promise, xhr } = upload();
    xhr.onabort?.();

    expect(((await thrown(() => promise)) as UploadError).reason).toBe("cancelled");
  });

  it("aborts the request in flight when the signal fires", async () => {
    const controller = new AbortController();
    const { promise, xhr } = upload({ signal: controller.signal });

    controller.abort();

    expect(xhr.aborted).toBe(true);
    expect(((await thrown(() => promise)) as UploadError).reason).toBe("cancelled");
  });

  it("settles without opening a request when the signal already fired", async () => {
    // A request that was never sent does not fire onabort, so calling abort()
    // here would leave the promise hanging forever.
    const controller = new AbortController();
    controller.abort();

    const promise = putSignedFile({
      url: SIGNED_URL,
      file: new File(["x"], "report.pdf", { type: "application/pdf" }),
      contentType: "application/pdf",
      signal: controller.signal,
    });

    expect(((await thrown(() => promise)) as UploadError).reason).toBe("cancelled");
    expect(FakeXhr.created).toHaveLength(0);
  });
});
