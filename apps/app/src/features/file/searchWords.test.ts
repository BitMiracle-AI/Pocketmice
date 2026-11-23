// To run it, in apps/app: node --test src/features/file/searchWords.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEARCH_QUERY_MAX_LENGTH } from '@pocketmice/contract/domains/file';
import { wordsOf } from './searchWords.ts';

test('words in the address are the words looked for, without the spaces around them', () => {
  assert.equal(wordsOf('budget'), 'budget');
  assert.equal(wordsOf('  q3 notes '), 'q3 notes');
});

test('what the router read as a number or a yes is the words it was written as', () => {
  assert.equal(wordsOf(2026), '2026');
  assert.equal(wordsOf(true), 'true');
  assert.equal(wordsOf(false), 'false');
});

test('an address that says nothing to look for has no words', () => {
  for (const nothing of [undefined, null, '', '   ', ['budget'], { q: 'budget' }]) {
    assert.equal(wordsOf(nothing), undefined, JSON.stringify(nothing));
  }
});

test('more than the api takes is no words: the page starts empty, and does not ask for what will be refused', () => {
  assert.equal(wordsOf('a'.repeat(SEARCH_QUERY_MAX_LENGTH)), 'a'.repeat(SEARCH_QUERY_MAX_LENGTH));
  assert.equal(wordsOf('a'.repeat(SEARCH_QUERY_MAX_LENGTH + 1)), undefined);
});

test('two ways of writing one letter are the same words', () => {
  assert.equal(wordsOf('re\u0301sume\u0301'), 'r\u00e9sum\u00e9');
});
