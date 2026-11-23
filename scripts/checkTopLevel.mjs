// Checks that the top level of each agreed folder holds only the files and subfolders on its list. The folders
// checked are the ones in TARGETS below.
// Why: when it is not clear where a file belongs, the easiest place to put it is the top level. Left alone, the top
// level of src grows into one long flat list where the code that answers requests, starts the process, calls outside
// services and signs users in all sits side by side. A new file that is not on the list is stopped here and goes
// into one of the agreed folders instead.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The folders to check. files are the files allowed at the top level and dirs the subfolders allowed there; nothing
 * else is. Without dirs, any subfolder is allowed.
 * hint is appended to the message and says where something that is not on the list should go.
 */
const TARGETS = [
  {
    dir: 'apps/api/src',
    // main.ts starts the process, app.ts mounts every route, env.ts reads the configuration, instances.ts builds
    // the set a running server uses and migrate.ts is the command that applies migrations. db.test.ts tests
    // @pocketmice/db against a real database: the address of the database is the api's configuration, so the test
    // is here. sdk.test.ts tests @pocketmice/sdk against a running api, which a package cannot start: it does not
    // import an app. The four folders are the only places any other code goes
    files: [
      'app.test.ts',
      'app.ts',
      'db.test.ts',
      'env.test.ts',
      'env.ts',
      'instances.ts',
      'main.ts',
      'migrate.ts',
      'sdk.test.ts'
    ],
    dirs: ['domains', 'external', 'http', 'storage'],
    hint: 'Put it in domains/<domain>/ (one area of the product), http/ (how every request is received, checked and answered), storage/ (where the bytes of files are kept) or external/<service>/ (how a service outside the api is used, like mail).'
  },
  {
    dir: 'apps/api/src/domains',
    // Any subfolder is allowed: there is one per domain, and adding a domain should not mean editing this list.
    // The files that stay at the top level are the ones that list something from every domain: every
    // implementation, what every domain makes ready for someone who signs in, and the setup the tests of every
    // domain share
    files: ['implementations.test.ts', 'implementations.ts', 'prepareSignIn.ts', 'testing.ts'],
    hint: 'Put it in the folder of the domain it belongs to, domains/<domain>/. Only a file that lists something from every domain stays here.'
  }
];

/**
 * Checks the top level of dir. Returns one message for each entry that is not on the list, or an empty array if
 * every entry is.
 * files are the files allowed and dirs the subfolders allowed; without dirs, any subfolder is allowed. label is what
 * the folder is called in the messages.
 * Names starting with . are skipped (what the system puts there itself, such as .DS_Store).
 */
export function checkTopLevel(dir, { label, files, dirs, hint }) {
  const allowed = (entry) => (entry.isDirectory() ? !dirs || dirs.includes(entry.name) : files.includes(entry.name));

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && !allowed(entry))
    .map((entry) => entry.name)
    .sort()
    .map((name) => `${label}/${name} is not allowed at the top level of ${label}. ${hint}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const problems = TARGETS.flatMap(({ dir, ...options }) => checkTopLevel(join(root, dir), { label: dir, ...options }));
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log('Top level check passed');
}
