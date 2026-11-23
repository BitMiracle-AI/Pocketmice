// What the pages read off the name of a file, with nothing of the browser in it.

/**
 * How many characters of a name come before its last extension: 6 for report.pdf, 11 for archive.tar.gz, and the
 * whole name when it has none. A dot at the very start is part of the name, not the start of an extension: .env
 * has none.
 */
export function stemLength(name: string): number {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? dot : name.length;
}
