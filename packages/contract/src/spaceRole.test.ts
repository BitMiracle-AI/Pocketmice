import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grantableRole, roleCovers, SPACE_ROLES } from './spaceRole.ts';

test('a role covers itself and every role before it, and none after it', () => {
  const covered = Object.fromEntries(
    SPACE_ROLES.map((held) => [held, SPACE_ROLES.filter((needed) => roleCovers(held, needed))])
  );

  assert.deepEqual(covered, {
    viewer: ['viewer'],
    editor: ['viewer', 'editor'],
    owner: ['viewer', 'editor', 'owner']
  });
});

test('every role but owner can be given to someone', () => {
  assert.deepEqual(grantableRole.options, ['viewer', 'editor']);
  assert.equal(grantableRole.safeParse('owner').success, false);
});
