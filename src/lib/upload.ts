/**
 * Sending the bytes.
 *
 * The transfer does not go through the API. The server signs a URL, the browser
 * puts the file straight into the bucket, and only afterwards does the server
 * hear that it arrived. Two things about this file follow from that.
 *
 * It uses `XMLHttpRequest` rather than `fetch`, which is not nostalgia: `fetch`
 * cannot report upload progress at all. A ten-megabyte transfer with no
 * feedback is indistinguishable from a frozen page, and the person uploading an
 * inspection report is standing in a machine room on a phone — the worst
 * connection of anyone who uses this product.
 *
 * And it sends nothing of ours. No `Authorization` header, no cookies. The URL
 * carries its own signature; our access token has no business at a third party.
 * The signature also covers the content type, so that header has to be exactly
 * the one the server signed — a helpful guess would void it.
 */

/** Why a transfer ended without the file arriving. */
export type UploadFailure = "expired" | "network" | "rejected" | "cancelled";

export class UploadError extends Error {
  constructor(
    readonly reason: UploadFailure,
    readonly status = 0,
  ) {
    super(`upload ${reason}`);
    this.name = "UploadError";
  }
}

interface PutOptions {
  url: string;
  file: File;
  /** Exactly the type the server signed for. A different one voids the signature. */
  contentType: string;
  /** Called with 0…1. Only fires when the browser knows the total. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export function putSignedFile({
  url,
  file,
  contentType,
  onProgress,
  signal,
}: PutOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      // Rejecting here rather than calling abort(): a request that was never
      // sent does not fire onabort, and the promise would never settle.
      reject(new UploadError("cancelled"));
      return;
    }

    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    request.setRequestHeader("Content-Type", contentType);
    // The bucket is somebody else's origin. Sending credentials would put our
    // session cookie there and fail the preflight on the way.
    request.withCredentials = false;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        // The last progress event can arrive before the response does, so the
        // bar would otherwise sit at 98% on a file that is already there.
        onProgress?.(1);
        resolve();
        return;
      }
      // R2 answers an expired signature and a malformed one alike with 403.
      // They are indistinguishable from here and both are fixed the same way —
      // ask for a new URL — so calling it expired is the honest reading and
      // also the useful advice.
      reject(new UploadError(request.status === 403 ? "expired" : "rejected", request.status));
    };

    request.onerror = () => reject(new UploadError("network"));
    request.ontimeout = () => reject(new UploadError("network"));
    request.onabort = () => reject(new UploadError("cancelled"));

    signal?.addEventListener("abort", () => request.abort(), { once: true });

    request.send(file);
  });
}
