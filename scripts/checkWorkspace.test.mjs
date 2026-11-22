import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkWorkspace } from './checkWorkspace.mjs';

// The script's own lists of server-only packages and root-level units are empty for now, so the tests of those two
// rules bring their own: a database package, a package of code shared by server units, and a root-level unit
const LISTS = {
  serverOnlyPackages: new Map([
    ['@pocketmice/db', new Set(['@pocketmice/api', '@pocketmice/e2e'])],
    ['@pocketmice/server', new Set(['@pocketmice/api'])]
  ]),
  rootUnits: ['e2e']
};

/**
 * Builds a workspace in a temporary folder. Each key is the folder of a unit ('apps/api'), each value is the content
 * of its package.json (null creates the folder without one).
 */
function workspace(t, units) {
  const root = mkdtempSync(join(tmpdir(), 'pocketmice-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const [where, manifest] of Object.entries(units)) {
    mkdirSync(join(root, where), { recursive: true });
    if (manifest) writeFileSync(join(root, where, 'package.json'), JSON.stringify(manifest));
  }
  return root;
}

test('a workspace that follows every rule has no problems', (t) => {
  const root = workspace(t, {
    'apps/api': {
      name: '@pocketmice/api',
      dependencies: {
        '@pocketmice/contract': 'workspace:*',
        '@pocketmice/db': 'workspace:*',
        '@pocketmice/server': 'workspace:*'
      }
    },
    'apps/web': { name: '@pocketmice/web', dependencies: { '@pocketmice/client': 'workspace:*' } },
    'packages/client': { name: '@pocketmice/client', dependencies: { '@pocketmice/contract': 'workspace:*' } },
    'packages/contract': { name: '@pocketmice/contract' },
    'packages/db': { name: '@pocketmice/db' },
    'packages/server': { name: '@pocketmice/server' },
    // End-to-end tests have to set up a test database first, so this unit is on the list for the database package
    e2e: { name: '@pocketmice/e2e', devDependencies: { '@pocketmice/db': 'workspace:*' } }
  });

  assert.deepEqual(checkWorkspace(root, LISTS), []);
});

test('a unit in the repo root follows the rules too: a wrong name, a dependency on an app and a missing package.json are reported', (t) => {
  const wrong = workspace(t, {
    'apps/api': { name: '@pocketmice/api' },
    e2e: { name: 'tests', devDependencies: { '@pocketmice/api': 'workspace:*' } }
  });
  const empty = workspace(t, { e2e: null });

  assert.deepEqual(checkWorkspace(wrong, LISTS), [
    'e2e must be named @pocketmice/e2e, but is named tests',
    'e2e depends on an app: @pocketmice/api'
  ]);
  assert.deepEqual(checkWorkspace(empty, LISTS), ['e2e has no package.json']);
});

test('a unit that is not on the list and depends on the database package is reported', (t) => {
  const root = workspace(t, {
    'apps/web': { name: '@pocketmice/web', dependencies: { '@pocketmice/db': 'workspace:*' } },
    'packages/contract': { name: '@pocketmice/contract', dependencies: { '@pocketmice/db': 'workspace:*' } },
    'packages/db': { name: '@pocketmice/db' }
  });

  assert.deepEqual(checkWorkspace(root, LISTS), [
    'apps/web must not depend on @pocketmice/db: only the units listed in scripts/checkWorkspace.mjs may',
    'packages/contract must not depend on @pocketmice/db: only the units listed in scripts/checkWorkspace.mjs may'
  ]);
});

test('a unit that is not on the list and depends on the shared server package is reported: what is in it must not reach a client', (t) => {
  const root = workspace(t, {
    'apps/web': { name: '@pocketmice/web', dependencies: { '@pocketmice/server': 'workspace:*' } },
    'packages/client': { name: '@pocketmice/client', dependencies: { '@pocketmice/server': 'workspace:*' } },
    'packages/server': { name: '@pocketmice/server' }
  });

  assert.deepEqual(checkWorkspace(root, LISTS), [
    'apps/web must not depend on @pocketmice/server: only the units listed in scripts/checkWorkspace.mjs may',
    'packages/client must not depend on @pocketmice/server: only the units listed in scripts/checkWorkspace.mjs may'
  ]);
});

test('a package name that does not match the folder name is reported', (t) => {
  const root = workspace(t, { 'apps/api': { name: 'server' } });

  assert.deepEqual(checkWorkspace(root), ['apps/api must be named @pocketmice/api, but is named server']);
});

test('an app that depends on another app is reported, also when it is a dev dependency', (t) => {
  const root = workspace(t, {
    'apps/api': { name: '@pocketmice/api' },
    'apps/web': { name: '@pocketmice/web', devDependencies: { '@pocketmice/api': 'workspace:*' } }
  });

  assert.deepEqual(checkWorkspace(root), ['apps/web depends on another app: @pocketmice/api']);
});

test('a package that depends on an app is reported', (t) => {
  const root = workspace(t, {
    'apps/api': { name: '@pocketmice/api' },
    'packages/contract': { name: '@pocketmice/contract', dependencies: { '@pocketmice/api': 'workspace:*' } }
  });

  assert.deepEqual(checkWorkspace(root), ['packages/contract depends on an app: @pocketmice/api']);
});

test('a unit folder without a package.json is reported', (t) => {
  const root = workspace(t, { 'apps/web': null });

  assert.deepEqual(checkWorkspace(root), ['apps/web has no package.json']);
});
