import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spaceName } from './space.ts';

test('the name of a space is trimmed, and is not empty after that', () => {
  assert.equal(spaceName.parse('  Research notes '), 'Research notes');
  assert.equal(spaceName.safeParse('   ').success, false);
  assert.equal(spaceName.safeParse('').success, false);
});

test('a name longer than the limit is refused', () => {
  assert.equal(spaceName.safeParse('a'.repeat(50)).success, true);
  assert.equal(spaceName.safeParse('a'.repeat(51)).success, false);
});
