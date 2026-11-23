import { FILE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/file';

/**
 * A name close to name that is not among taken: the number in brackets goes before the last extension, and counts
 * up from 2 until the name is free. report.pdf becomes report (2).pdf, then report (3).pdf; a name that already
 * ends in such a number counts on from it.
 * A name that would be longer than a name may be loses the end of its stem, never its extension.
 */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  // A dot at the very start is part of the name, not the start of an extension: .env has none
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  const numbered = /^(.*) \((\d+)\)$/.exec(stem);
  const base = numbered?.[1] ?? stem;

  for (let number = numbered ? Number(numbered[2]) + 1 : 2; ; number++) {
    const suffix = ` (${number})${extension}`;
    const candidate = [...base].slice(0, Math.max(1, FILE_NAME_MAX_LENGTH - suffix.length)).join('') + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}
