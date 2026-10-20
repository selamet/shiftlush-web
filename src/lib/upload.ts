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
import {
  confirmUpload,
  requestUploadTicket,
  type Attachment,
  type AttachmentCategory,
  type AttachmentObjectType,
} from "@/api/queries";

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

/**
 * What the server accepts, restated here to save a wasted transfer.
 *
 * These two numbers are the server's rule, not this file's: they are declared
 * in the contract as `MimeTypeEnum` and the maximum on `size_bytes`. Checking
 * them here only means a refusal arrives in a moment instead of after four
 * minutes of uploading a file that was never going to be accepted. The server
 * still decides — anything it rejects is shown as it explained it.
 */
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Why a file is not worth sending, or `null` when it is. The caller words it. */
export function uploadRefusal(
  file: Pick<File, "type" | "size">,
  allowed: readonly string[] = ALLOWED_UPLOAD_TYPES,
): "type" | "tooLarge" | null {
  if (!allowed.includes(file.type)) return "type";
  if (file.size > MAX_UPLOAD_BYTES) return "tooLarge";
  return null;
}

interface UploadAttachmentOptions {
  objectType: AttachmentObjectType;
  objectId: string;
  category: AttachmentCategory;
  file: File;
  /**
   * One per file, kept across that file's retries. See `Transfer` in the
   * attachments panel for why a per-form key is the wrong grain here.
   */
  idempotencyKey: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * The whole journey of one file: a ticket, the bytes, the confirmation.
 *
 * Written once because two screens need it in the same order — the attachments
 * panel, and the visit form, which sends its photos after the visit exists —
 * and the order is the part that is easy to get subtly wrong. A fresh ticket
 * every call: retrying with the previous URL is the one thing guaranteed not
 * to work when the reason for retrying was that it expired.
 */
export async function uploadAttachment({
  objectType,
  objectId,
  category,
  file,
  idempotencyKey,
  onProgress,
  signal,
}: UploadAttachmentOptions): Promise<Attachment> {
  const ticket = await requestUploadTicket({
    object_type: objectType,
    object_id: objectId,
    category,
    mime_type: file.type as never,
    size_bytes: file.size,
  });

  await putSignedFile({
    url: ticket.upload_url,
    file,
    contentType: ticket.content_type,
    onProgress,
    signal,
  });

  return confirmUpload(
    { storage_key: ticket.storage_key, original_filename: file.name },
    idempotencyKey,
  );
}
