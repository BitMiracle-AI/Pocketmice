import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkTopLevel } from './checkTopLevel.mjs';

const RULES = { label: 'apps/x/src', files: ['main.ts', 'main.test.ts'], dirs: ['domains', 'http'], hint: 'Move it.' };

/** Creates these files in a temporary folder and returns that folder */
function files(t, paths) {
  const root = mkdtempSync(join(tmpdir(), 'pocketmice-top-level-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), '');
  }
  return root;
}

test('a top level with only the listed files and subfolders has no problems; what is inside a subfolder is not checked', (t) => {
  const root = files(t, ['main.ts', 'main.test.ts', 'domains/team/getTeams.ts', 'http/anything.ts']);

  assert.deepEqual(checkTopLevel(root, RULES), []);
});

test('a file at the top level that is not on the list is reported, with where to put it', (t) => {
  const root = files(t, ['main.ts', 'mailer.ts']);

  assert.deepEqual(checkTopLevel(root, RULES), [
    'apps/x/src/mailer.ts is not allowed at the top level of apps/x/src. Move it.'
  ]);
});

test('a subfolder at the top level that is not on the list is reported too', (t) => {
  const root = files(t, ['main.ts', 'services/mailer.ts']);

  assert.deepEqual(checkTopLevel(root, RULES), [
    'apps/x/src/services is not allowed at the top level of apps/x/src. Move it.'
  ]);
});

test('a name listed as a file cannot be used for a subfolder, nor the other way round', (t) => {
  const root = files(t, ['main.ts/inside.ts', 'http']);

  assert.deepEqual(checkTopLevel(root, RULES), [
    'apps/x/src/http is not allowed at the top level of apps/x/src. Move it.',
    'apps/x/src/main.ts is not allowed at the top level of apps/x/src. Move it.'
  ]);
});

test('without a list of subfolders any subfolder is allowed, while files still have to be on the list', (t) => {
  const root = files(t, ['main.ts', 'team/getTeams.ts', 'anything/inside.ts', 'loose.ts']);
  const { dirs: _dirs, ...anyDirs } = RULES;

  assert.deepEqual(checkTopLevel(root, anyDirs), [
    'apps/x/src/loose.ts is not allowed at the top level of apps/x/src. Move it.'
  ]);
});

test('names starting with . are skipped: what the system puts there itself is not our code', (t) => {
  const root = files(t, ['main.ts', '.DS_Store']);

  assert.deepEqual(checkTopLevel(root, RULES), []);
});
