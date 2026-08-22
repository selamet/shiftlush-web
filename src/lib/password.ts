/**
 * The password floor, written once.
 *
 * Three screens ask for a password and each one used to carry its own copy of
 * this number. That is the same shape of bug that had to be fixed on the server
 * in the same change: the floor was lowered in one place, the other place went
 * on refusing at the old length, and the mismatch only showed up as a form that
 * rejected a password the server would have accepted.
 *
 * `scripts/check-password-length.mjs` compares this against the API contract on
 * every run, so the two repositories cannot drift apart quietly.
 *
 * This is a courtesy, not a rule. It saves a round trip on an obviously short
 * password; the server owns the actual policy, including the blocklist and the
 * similarity check, neither of which can be evaluated here.
 */
export const MIN_PASSWORD_LENGTH = 6;
