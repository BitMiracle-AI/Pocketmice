import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileName } from './profile.ts';

test('a name is trimmed, and is not empty after that', () => {
  assert.equal(profileName.parse('  Ada Lovelace '), 'Ada Lovelace');
  assert.equal(profileName.safeParse('   ').success, false);
  assert.equal(profileName.safeParse('').success, false);
});

test('a name longer than the limit is refused', () => {
  assert.equal(profileName.safeParse('a'.repeat(50)).success, true);
  assert.equal(profileName.safeParse('a'.repeat(51)).success, false);
});
