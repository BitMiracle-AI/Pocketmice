import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import * as entrance from './index.ts';

// The package as it is published. Inside this repository the SDK is its source, and what a program installs from
// npm is something else: one file of JavaScript and one of declarations, which the "build" script of package.json
// makes, with the contract and the client inside them (see tsconfig.build.json). Nothing else in the repository
// runs that script, so without this test a build that stopped working would be found on the day of a release.
// What a program that installed the package gets from each runtime, and from the types of each TypeScript, is not
// tried here: that is done by hand with the tarball before it is published.

/** The folder of the package: where its package.json is */
const packageDir = fileURLToPath(new URL('..', import.meta.url));

/** Where this test file has the package built: a folder of its own, not the dist that is published */
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pocketmice-test-sdk-build-'));
  await promisify(execFile)('pnpm', ['run', 'build', '--out-dir', dir], { cwd: packageDir });
  // What the built file imports is found the way it is in a program that installed the package: in a node_modules
  // beside it
  await symlink(join(packageDir, 'node_modules'), join(dir, 'node_modules'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** What a built file imports: the names in its import and export statements, each once */
async function importedBy(name: string): Promise<string[]> {
  const text = await readFile(join(dir, name), 'utf8');
  const statements = text.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']|^import\s*["']([^"']+)["']/gm);
  return [...new Set([...statements].flatMap(([, from, bare]) => from ?? bare ?? []))];
}

test('the package is built whole: its code and its declarations import zod, which it depends on, and nothing else', async () => {
  // The contract and the client are not published. An import of either that was left in could not be installed
  assert.deepEqual(await importedBy('index.mjs'), ['zod']);
  assert.deepEqual(await importedBy('index.d.mts'), ['zod']);

  // And none that is made while the program runs, which the statements above would not show
  const code = await readFile(join(dir, 'index.mjs'), 'utf8');
  assert.doesNotMatch(code, /\bimport\s*\(|\brequire\s*\(/);
});

test('the built package is the SDK: it exports what the entrance exports, and a call goes out as it does from the source', async () => {
  const built: typeof entrance = await import(pathToFileURL(join(dir, 'index.mjs')).href);
  assert.deepEqual(Object.keys(built).sort(), Object.keys(entrance).sort());

  const sent: string[] = [];
  const config = {
    url: 'https://drive.example.com',
    apiKey: 'pm_test',
    fetch: async (url: string) => {
      sent.push(url);
      return new Response(JSON.stringify({ spaces: [] }));
    }
  };
  const drive = built.createPocketmice(config);

  assert.deepEqual(Object.keys(drive).sort(), Object.keys(entrance.createPocketmice(config)).sort());
  assert.deepEqual(await drive.getSpaces(), { spaces: [] });
  assert.deepEqual(sent, ['https://drive.example.com/api/getSpaces']);

  // The error of the built package is its own class, as it is for a program that installed it
  const refused = built.createPocketmice({ ...config, fetch: async () => new Response('', { status: 502 }) });
  await assert.rejects(refused.getSpaces(), (thrown) => thrown instanceof built.PocketmiceError);
});
