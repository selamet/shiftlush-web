/**
 * What counts as one of our labels.
 *
 * A printed sticker carries the absolute URL from spec 11.2 —
 * `https://<host>/q/{qr_token}` — and nothing else. The camera, though, reads
 * whatever is in front of it: the poster by the lift door, the inspection
 * company's own sticker, the serial-number barcode on the controller. Deciding
 * here rather than at the call site means the scanner can say "that is not one
 * of ours" while the camera is still running, instead of sending the technician
 * to a screen that comes back 404 a second later.
 *
 * The host is not checked. The same estate can be labelled from staging and
 * read in production, and a token is meaningless without the server anyway —
 * it is the server that decides whether this firm may see that lift. Pinning
 * the host here would only break stickers that are otherwise perfectly good.
 */

/**
 * The token as generated: nanoid, twelve characters, URL-safe alphabet
 * (spec 11.1). The column is `varchar(24)` so the length can grow later, and
 * the bound here is the column rather than today's twelve — a longer token
 * should start working when the server starts issuing one, not fail here.
 */
const TOKEN = /^[A-Za-z0-9_-]{8,24}$/;

/**
 * A trailing query or fragment is ignored rather than refused. Our own labels
 * carry neither, but a link that has been through a messaging app comes back
 * with tracking parameters glued to it, and refusing the sticker over `?utm=`
 * would be a rejection nobody could explain while standing in front of it.
 */
const LABEL_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/]+)?\/q\/([^/?#]+)\/?(?:[?#].*)?$/i;

/**
 * The token in a scanned code, or null if this was never one of our labels.
 *
 * A bare token is rejected on purpose, even though it would resolve. Our labels
 * always carry the full URL, so a code containing nothing but twelve plausible
 * characters is somebody else's — and treating it as ours would replace a
 * truthful "that is not a ShiftLush label" with a mystifying 404.
 */
export function tokenFromScan(raw: string): string | null {
  const match = LABEL_URL.exec(raw.trim());
  if (!match) return null;
  const token = match[1];
  return TOKEN.test(token) ? token : null;
}
