/**
 * Sending one maintenance visit out of the outbox: the record, then its photos.
 *
 * Written to be interrupted. Any step may be the one the connection drops on,
 * and the next attempt — seconds later from the form, or an hour later from
 * the background drain — has to carry on from there rather than start over.
 * Two things make that safe:
 *
 * - Every request carries a key derived from the entry, never a fresh one. The
 *   visit is created with the entry's id, which *is* its idempotency key, and
 *   photo `i` with `${entry.id}:photo:${i}`. A step that reached the server but
 *   whose answer was lost is answered from the server's stored result on the
 *   retry, instead of recording the visit twice or attaching a photo twice.
 * - Progress is saved after every step. A retry skips the create once there
 *   is a record id, and starts the photos at the first one not yet dealt with.
 *
 * Kept free of React so the resume logic is tested as a plain function.
 */
import { ApiError } from "@/api/client";
import { createVisit, type MaintenanceVisitWrite } from "@/api/queries";
import { classifyFailure, type OutboxEntry, type OutboxPhoto, type Sender } from "@/lib/outbox";
import { UploadError, uploadAttachment } from "@/lib/upload";

export type VisitOutboxEntry = OutboxEntry<MaintenanceVisitWrite>;

/** The key photo `index` of this entry is uploaded under, on every attempt. */
export function photoIdempotencyKey(entryId: string, index: number): string {
  return `${entryId}:photo:${index}`;
}

/**
 * What a failed photo means for the entry.
 *
 * `skip` — the server read the request and said no (a 4xx: too large, a type
 * it does not take). The same file sent again gets the same answer, so it is
 * set aside by name and the rest carry on; one bad photo must not hold the
 * visit's other photos, or the entry, hostage.
 *
 * `retry` — the connection, the server or the bucket's signature. Says nothing
 * about the photo, so the whole entry waits and resumes from this one.
 *
 * The bucket speaks its own errors (`UploadError`). An expired signature is
 * cured by the fresh ticket every attempt asks for, a dropped transfer by
 * trying again; a bucket refusing the bytes outright is the photo's problem.
 */
export function photoFailure(error: unknown): "skip" | "retry" {
  if (error instanceof UploadError) {
    if (error.reason === "rejected" && error.status >= 400 && error.status < 500) return "skip";
    return "retry";
  }
  return classifyFailure(error) === "retry" ? "retry" : "skip";
}

/**
 * A retryable failure in the shape the outbox reads.
 *
 * The outbox decides between "try later" and "ask a person" from `ApiError`
 * alone and treats anything else as a bug — right for the API, wrong for a
 * bucket transfer that merely lost its connection. So a retryable bucket
 * failure is rethrown as the network failure it is.
 */
function asRetryable(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  return new ApiError({ code: "NETWORK_ERROR", status: 0 });
}

function asFile(photo: OutboxPhoto): File {
  // Stored as a Blob plus its name and type — what IndexedDB keeps reliably on
  // every browser — and turned back into a File for the upload, which reads
  // the name for the record and the type for the signed request.
  return new File([photo.blob], photo.name, { type: photo.type });
}

export const sendVisit: Sender = async (entry, saveProgress) => {
  let progress = { ...entry.progress };

  if (!progress.recordId) {
    // A refusal here is thrown as it came: the visit itself was rejected, and
    // the outbox (or the form, on the first attempt) owns what happens next.
    const visit = await createVisit(entry.body as MaintenanceVisitWrite, entry.id);
    progress = { ...progress, recordId: visit.id, photosDone: 0 };
    await saveProgress(progress);
  }

  const recordId = progress.recordId as string;
  for (let index = progress.photosDone; index < entry.photos.length; index += 1) {
    const photo = entry.photos[index];
    try {
      await uploadAttachment({
        objectType: "maintenance_visit",
        objectId: recordId,
        category: "photo",
        file: asFile(photo),
        idempotencyKey: photoIdempotencyKey(entry.id, index),
      });
    } catch (error) {
      // Thrown before `photosDone` moves, so the next attempt starts here.
      if (photoFailure(error) === "retry") throw asRetryable(error);
      progress = { ...progress, photosSkipped: [...(progress.photosSkipped ?? []), photo.name] };
    }
    progress = { ...progress, photosDone: index + 1 };
    await saveProgress(progress);
  }
};
