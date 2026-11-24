// A person and a space each have a colour of their own, one of a few: the circle with a person's letters and the
// square with a space's letter are drawn in it, wherever they are shown. The colours themselves are in index.css
// (--tint-1 and on), and are the same number here as there.

/** How many colours there are to give */
export const TINTS = 6;

/**
 * Which of the colours belongs to what has this id: a number from 1 to TINTS. It is worked out from the id and kept
 * nowhere, so the same person has the same colour on every page and for everyone who looks, and keeps it when
 * they change their name.
 */
export function tintOf(id: string): number {
  let sum = 0;
  for (const letter of id) sum = (sum * 31 + (letter.codePointAt(0) ?? 0)) % 1_000_003;
  return (sum % TINTS) + 1;
}
