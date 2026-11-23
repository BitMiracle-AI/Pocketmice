// To run it, in apps/app: node --test src/lib/initials.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initials } from './initials.ts';

test('the first letter of the first two words, in capitals', () => {
  assert.equal(initials('Mina Okafor'), 'MO');
  assert.equal(initials('ada'), 'A');
  assert.equal(initials('  Jean  Luc Picard '), 'JL');
  assert.equal(initials('Product research', 1), 'P');
});

test('a letter is a whole character', () => {
  assert.equal(initials('张伟'), '张');
  assert.equal(initials('🐭 pocket'), '🐭P');
  assert.equal(initials('𠮷野 家'), '𠮷家');
});

test('a name with nothing in it has no letters', () => {
  assert.equal(initials(''), '');
  assert.equal(initials('   '), '');
});
