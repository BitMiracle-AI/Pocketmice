import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkKindFolders } from './checkKindFolders.mjs';

const RULES = { label: 'apps/x/src/features', names: ['components', 'hooks'], hint: 'Name it after a topic.' };

/** Creates these files in a temporary folder and returns that folder. A path ending in / creates an empty folder */
function files(t, paths) {
  const root = mkdtempSync(join(tmpdir(), 'pocketmice-kind-folders-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const path of paths) {
    if (path.endsWith('/')) {
      mkdirSync(join(root, path), { recursive: true });
      continue;
    }
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), '');
  }
  return root;
}

test('an area with its files laid out flat, or split into subfolders by topic, has no problems', (t) => {
  const root = files(t, ['team/TeamMembers.tsx', 'chat/thread/Thread.tsx', 'chat/composer/useDraft.ts']);

  assert.deepEqual(checkKindFolders(root, RULES), []);
});

test('a subfolder of an area named after a kind of code is reported, with how to name it instead', (t) => {
  const root = files(t, ['chat/components/Thread.tsx', 'chat/hooks/useDraft.ts']);

  assert.deepEqual(checkKindFolders(root, RULES), [
    'apps/x/src/features/chat/components is a folder named after a kind of code. Name it after a topic.',
    'apps/x/src/features/chat/hooks is a folder named after a kind of code. Name it after a topic.'
  ]);
});

test('one nested inside a topic subfolder is reported too', (t) => {
  const root = files(t, ['chat/thread/components/Thread.tsx']);

  assert.deepEqual(checkKindFolders(root, RULES), [
    'apps/x/src/features/chat/thread/components is a folder named after a kind of code. Name it after a topic.'
  ]);
});

test('an area itself cannot have such a name either', (t) => {
  const root = files(t, ['hooks/useDraft.ts']);

  assert.deepEqual(checkKindFolders(root, RULES), [
    'apps/x/src/features/hooks is a folder named after a kind of code. Name it after a topic.'
  ]);
});

test('names are compared ignoring case: Hooks is reported just like hooks', (t) => {
  const root = files(t, ['chat/Hooks/useDraft.ts']);

  assert.deepEqual(checkKindFolders(root, RULES), [
    'apps/x/src/features/chat/Hooks is a folder named after a kind of code. Name it after a topic.'
  ]);
});

test('only folders are looked at: a file with such a name is fine, and so is a folder whose name merely contains the word', (t) => {
  const root = files(t, ['chat/hooks.ts', 'chat/webhooks/Receive.tsx']);

  assert.deepEqual(checkKindFolders(root, RULES), []);
});

test('a subfolder with no files in it is not reported: an empty one, one with only empty subfolders, one with only .DS_Store', (t) => {
  // git does not track empty folders: the empty shell left on one machine after its files were moved away exists on
  // no other machine
  const root = files(t, ['chat/Thread.tsx', 'chat/hooks/', 'team/components/old/', 'auth/hooks/.DS_Store']);

  assert.deepEqual(checkKindFolders(root, RULES), []);
});

test('a subfolder whose files are one level further down is still reported', (t) => {
  const root = files(t, ['chat/hooks/draft/useDraft.ts']);

  assert.deepEqual(checkKindFolders(root, RULES), [
    'apps/x/src/features/chat/hooks is a folder named after a kind of code. Name it after a topic.'
  ]);
});
