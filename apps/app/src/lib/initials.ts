/**
 * The letters a person or a space is known by where there is room for one or two: the first letter of the first
 * two words of the name, in capitals. Mina Okafor is MO.
 * A letter is a whole character: one that takes two code units (an emoji, a rare Chinese character) is not cut in
 * half.
 */
export function initials(name: string, most = 2): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, most)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');
}
