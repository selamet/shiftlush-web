/**
 * Naming a lift that may have no name.
 *
 * Nothing identifying about an elevator is required. The registration number is
 * assigned by the inspection body and a lift can be on the books before it has
 * one; the display name is a convenience the firm may not bother with; the
 * category is optional too. So a perfectly valid record can arrive with an
 * empty string in every field a screen would reach for first.
 *
 * The contract calls these fields required, which means the key is always
 * present — not that it carries anything. That distinction is what put a link
 * with no text in the elevators list: the row rendered, the anchor rendered,
 * and there was nothing on screen to click, so the lift could not be opened at
 * all.
 *
 * `null` here means "this record cannot name itself". Each screen decides what
 * to say instead, because the honest phrasing differs: a list column headed
 * "registration number" wants to say that one is missing, while a contract line
 * wants to fall back to the name before admitting defeat.
 */

interface Named {
  registration_number?: string | null;
  name?: string | null;
}

/** The registration number if there is one, otherwise nothing. */
export function registrationNumber(row: Named): string | null {
  return row.registration_number?.trim() || null;
}

/**
 * The best name this record can give for itself: its number, else its name.
 *
 * In that order because the number is the one identifier anybody outside the
 * firm — an inspector, a report, the sticker on the lift — will use.
 */
export function elevatorLabel(row: Named): string | null {
  return registrationNumber(row) ?? (row.name?.trim() || null);
}

/**
 * A filename stem for something belonging to this lift.
 *
 * Falls back to the record's id rather than to nothing: `qr-.pdf` in a folder
 * of downloads is worse than an unmemorable name, because two of them collide
 * and the second silently replaces the first.
 */
export function elevatorFileStem(row: Named & { id: string }): string {
  return (elevatorLabel(row) ?? row.id).replace(/[^\p{L}\p{N}._-]+/gu, "-");
}
