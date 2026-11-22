import assert from 'node:assert/strict';
import { test } from 'node:test';
import { id } from './id.ts';

test('a lowercase uuid is an id', () => {
  assert.equal(id.safeParse('3f2c8a52-7d0e-4b6f-9a1c-5e8d2b4f6a70').success, true);
});

test('the same uuid in uppercase is not: an id has one spelling', () => {
  assert.equal(id.safeParse('3F2C8A52-7D0E-4B6F-9A1C-5E8D2B4F6A70').success, false);
  assert.equal(id.safeParse('3f2c8a52-7d0e-4b6f-9a1c-5e8d2b4f6A70').success, false);
});

test('anything that is not a uuid is not an id', () => {
  for (const other of ['', 'abc', '3f2c8a52', '3f2c8a527d0e4b6f9a1c5e8d2b4f6a70', 42, null, undefined]) {
    assert.equal(id.safeParse(other).success, false, `${String(other)} should be refused`);
  }
});
