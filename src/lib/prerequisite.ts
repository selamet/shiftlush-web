/**
 * Whether the record a list depends on actually exists yet.
 *
 * An empty complex list has two quite different causes: this firm has no
 * customers, so there is nothing a complex could belong to — or it has plenty
 * and simply has not grouped any buildings into a site yet. The first wants to
 * be sent to the customer list. The second wants the create button.
 *
 * These were treated as one. The empty state declared its prerequisite
 * unconditionally, so a firm with two hundred customers opening an empty
 * complex list was told it needed a parent record first and offered "add a
 * customer" — false, and it hid the action that was actually wanted.
 *
 * This reads an answer rather than fetching one, so the parent query stays at
 * the call site where its own type is known. Ask for a single row: the count is
 * the whole answer, and it is only worth asking when the list came back empty.
 */

interface CountedQuery {
  isPending: boolean;
  isError: boolean;
  data?: { pagination: { total: number } };
}

/**
 * `true` when the parent record is missing, `false` when it exists, and
 * `undefined` while that is still being found out.
 *
 * The third state is deliberate rather than collapsed into either answer: both
 * offers are wrong half the time, so guessing means the empty state changes its
 * message a moment after the reader started reading it.
 */
export function prerequisiteMissing(
  parents: CountedQuery,
  /** Whether the question arises at all — false when the list has rows. */
  asked: boolean,
): boolean | undefined {
  if (!asked) return false;

  // An error is not an answer. Reporting "you have no customers" because a
  // request failed would send somebody off to create what they already have.
  if (parents.isPending || parents.isError || !parents.data) return undefined;

  return parents.data.pagination.total === 0;
}
