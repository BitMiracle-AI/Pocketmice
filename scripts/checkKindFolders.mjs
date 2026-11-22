// Checks that a folder organised by area of the product has no subfolder named after a kind of code. The folders
// checked are the ones in TARGETS below: for now, the domains of the api (apps/api/src/domains).
// Why: once an area has many files, the handiest way to split them is by kind (routes, services, utils). Split that
// way, the pieces of one task are scattered over several folders, and each of those folders is a long flat list of
// files that have nothing to do with each other.
// Split by topic instead: a subfolder is one thing the area does, and everything that thing needs is inside it.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The folders to check. names are the subfolder names that may not be used at any depth inside (compared ignoring
 * case). hint is appended to the message and says how to name the folder instead.
 */
const TARGETS = [
  {
    dir: 'apps/api/src/domains',
    // The usual ways of splitting server code by kind
    names: ['routes', 'services', 'handlers', 'utils', 'helpers', 'lib'],
    hint: 'Name a folder under domains/ after an area of the product or, inside a domain, after one thing the domain does.'
  }
];

/**
 * Checks every level under dir. Returns one message for each subfolder whose name is in names, or an empty array if
 * there are none.
 * Only folders are looked at, a file may have any name. Names are compared ignoring case (Utils is the same as
 * utils). label is what the folder is called in the messages.
 * A subfolder with no files in it does not count: git does not track empty folders, so the empty shell left on one
 * machine after its files were moved away exists on no other machine, and reporting it would fail on that machine
 * alone.
 * Names starting with . are skipped and do not count as files either (what the system puts there itself, such as
 * .DS_Store).
 */
export function checkKindFolders(dir, { label, names, hint }) {
  const problems = [];

  /** Checks every level under current and returns whether there is a file anywhere inside it */
  function visit(current, path) {
    let hasFiles = false;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (!entry.isDirectory()) {
        hasFiles = true;
        continue;
      }

      const here = `${path}/${entry.name}`;
      if (!visit(join(current, entry.name), here)) continue;
      hasFiles = true;
      if (names.includes(entry.name.toLowerCase())) {
        problems.push(`${here} is a folder named after a kind of code. ${hint}`);
      }
    }
    return hasFiles;
  }

  visit(dir, label);
  return problems.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const problems = TARGETS.flatMap(({ dir, ...options }) =>
    checkKindFolders(join(root, dir), { label: dir, ...options })
  );
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('Kind folder check passed');
}
