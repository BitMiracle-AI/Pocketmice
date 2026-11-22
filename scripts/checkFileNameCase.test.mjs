import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkFileNameCase } from './checkFileNameCase.mjs';

/** Creates these files in a temporary folder and returns that folder */
function files(t, paths) {
  const root = mkdtempSync(join(tmpdir(), 'pocketmice-names-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), '');
  }
  return root;
}

test('names git tracks that are exactly the names on disk have no problems', (t) => {
  const paths = ['src/features/auth/LoginPage.tsx', 'src/hooks/useCurrentUser.ts', 'package.json'];
  const root = files(t, paths);

  assert.deepEqual(checkFileNameCase(root, paths), []);
});

test('a file renamed only in case while git still tracks the old name is reported, with the command that fixes it', (t) => {
  const root = files(t, ['src/features/auth/LoginPage.tsx']);

  assert.deepEqual(checkFileNameCase(root, ['src/features/auth/loginPage.tsx']), [
    'git tracks src/features/auth/loginPage.tsx but on disk it is named LoginPage.tsx. Run: git mv src/features/auth/loginPage.tsx src/features/auth/LoginPage.tsx'
  ]);
});

test('a folder renamed only in case is reported too, and only once however many files are in it', (t) => {
  const root = files(t, ['src/Features/a.ts', 'src/Features/b.ts']);

  assert.deepEqual(checkFileNameCase(root, ['src/features/a.ts', 'src/features/b.ts']), [
    'git tracks src/features but on disk it is named Features. Run: git mv src/features src/Features'
  ]);
});

test('a file git tracks that is already deleted from disk is not reported', (t) => {
  const root = files(t, ['src/a.ts']);

  assert.deepEqual(checkFileNameCase(root, ['src/b.ts', 'gone/c.ts']), []);
});
