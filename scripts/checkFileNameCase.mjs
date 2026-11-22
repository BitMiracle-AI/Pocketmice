// Checks that every file name git tracks has the same upper and lower case as the name on disk.
// A disk that ignores case, the default on macOS, hides the difference: rename loginPage.ts to LoginPage.ts and git
// does not notice, it keeps tracking the old name, and everything still works on that machine. On Linux, where case
// matters, an import written with the new name cannot find the file.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * trackedPaths are the paths git tracks, relative to root and separated by /.
 * The case of every name along a path has to be the same as on disk. Returns one message for each place where it is
 * not, or an empty array if they all match.
 */
export function checkFileNameCase(root, trackedPaths) {
  // Each folder is read only once
  const listings = new Map();
  function namesIn(dir) {
    if (!listings.has(dir)) {
      let names = [];
      try {
        names = readdirSync(join(root, dir));
      } catch {
        // The folder is gone: treated below as "no such name on disk"
      }
      listings.set(dir, names);
    }
    return listings.get(dir);
  }

  const problems = new Set();
  for (const path of trackedPaths) {
    let dir = '';
    for (const name of path.split('/')) {
      const here = dir ? `${dir}/${name}` : name;
      const names = namesIn(dir);
      if (!names.includes(name)) {
        const onDisk = names.find((other) => other.toLowerCase() === name.toLowerCase());
        // No such name on disk in any case: the file was deleted and the deletion is not committed yet, which is
        // not for this check to report
        if (onDisk) {
          const renamed = dir ? `${dir}/${onDisk}` : onDisk;
          problems.add(`git tracks ${here} but on disk it is named ${onDisk}. Run: git mv ${here} ${renamed}`);
        }
        break;
      }
      dir = here;
    }
  }

  return [...problems].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  // -z: paths are separated by \0 and printed as they are, also when a name has spaces or non-ASCII characters
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
  const problems = checkFileNameCase(root, tracked);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('File name case check passed');
}
