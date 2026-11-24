// To run it, in apps/app: node --test src/features/space/storageLimit.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLimit, limitOf, shareOf, typedOf } from './storageLimit.ts';

const MB = 1024 ** 2;
const GB = 1024 ** 3;

test('an empty field is no limit, and 0 is a limit', () => {
  assert.equal(limitOf({ amount: '', unit: 'GB' }), null);
  assert.equal(limitOf({ amount: '   ', unit: 'MB' }), null);
  assert.equal(limitOf({ amount: '0', unit: 'GB' }), 0);
});

test('an amount is so many of its unit, in bytes', () => {
  assert.equal(limitOf({ amount: '10', unit: 'GB' }), 10 * GB);
  assert.equal(limitOf({ amount: '500', unit: 'MB' }), 500 * MB);
  assert.equal(limitOf({ amount: ' 2 ', unit: 'GB' }), 2 * GB);
});

test('an amount may have a point, and comes out as whole bytes', () => {
  assert.equal(limitOf({ amount: '1.5', unit: 'GB' }), 1.5 * GB);
  assert.equal(limitOf({ amount: '.5', unit: 'GB' }), 0.5 * GB);
  assert.equal(limitOf({ amount: '2.', unit: 'MB' }), 2 * MB);
  // A third of a megabyte is no whole number of bytes: the nearest one
  assert.equal(limitOf({ amount: '0.333', unit: 'MB' }), 349_176);
});

test('what is not an amount is invalid', () => {
  for (const amount of ['abc', '-1', '+1', '1e3', '1,5', '1.5.2', '.', '10 GB', '１０', '0x10', 'Infinity']) {
    assert.equal(limitOf({ amount, unit: 'GB' }), 'invalid', amount);
  }
});

test('more than a limit may be is invalid', () => {
  // The most a limit may be is the largest whole number the api takes: 8388608 GB, less one byte
  assert.equal(limitOf({ amount: '8388607', unit: 'GB' }), 8_388_607 * GB);
  assert.equal(limitOf({ amount: '8388608', unit: 'GB' }), 'invalid');
  assert.equal(limitOf({ amount: '9'.repeat(400), unit: 'MB' }), 'invalid');
});

test('the field shows no limit as nothing, and a limit in the unit it is at least one of', () => {
  assert.deepEqual(typedOf(null), { amount: '', unit: 'GB' });
  assert.deepEqual(typedOf(2 * GB), { amount: '2', unit: 'GB' });
  assert.deepEqual(typedOf(1.5 * GB), { amount: '1.5', unit: 'GB' });
  assert.deepEqual(typedOf(GB), { amount: '1', unit: 'GB' });
  assert.deepEqual(typedOf(GB - MB), { amount: '1023', unit: 'MB' });
  assert.deepEqual(typedOf(500 * MB), { amount: '500', unit: 'MB' });
  assert.deepEqual(typedOf(0), { amount: '0', unit: 'MB' });
});

test('what the field shows for a limit that was typed is that limit again', () => {
  for (const limit of [0, MB, 500 * MB, 1.25 * GB, 10 * GB, 2048 * GB, 8_388_607 * GB]) {
    assert.equal(limitOf(typedOf(limit)), limit, String(limit));
  }
});

test('a limit that is no round amount is shown rounded', () => {
  // A limit set through the api, in bytes
  assert.deepEqual(typedOf(1_000_000_000), { amount: '953.67', unit: 'MB' });
});

test('what was typed is the limit that is there however it is written', () => {
  assert.equal(isLimit({ amount: '1024', unit: 'MB' }, GB), true);
  assert.equal(isLimit({ amount: '2.0', unit: 'GB' }, 2 * GB), true);
  assert.equal(isLimit({ amount: '', unit: 'MB' }, null), true);
  assert.equal(isLimit({ amount: '2', unit: 'GB' }, GB), false);
  assert.equal(isLimit({ amount: '2', unit: 'MB' }, 2 * GB), false);
});

test('no limit and a limit of 0 are not the same, and neither is what cannot be read', () => {
  assert.equal(isLimit({ amount: '0', unit: 'GB' }, null), false);
  assert.equal(isLimit({ amount: '', unit: 'GB' }, 0), false);
  assert.equal(isLimit({ amount: 'abc', unit: 'GB' }, null), false);
  assert.equal(isLimit({ amount: 'abc', unit: 'GB' }, GB), false);
});

test('a limit that is shown rounded and left as it is shown is the one that is there', () => {
  assert.equal(isLimit(typedOf(1_000_000_000), 1_000_000_000), true);
  assert.equal(isLimit({ amount: '954', unit: 'MB' }, 1_000_000_000), false);
});

test('what is held is a share of its limit, and never more than all of it', () => {
  assert.equal(shareOf(0, 10 * GB), 0);
  assert.equal(shareOf(GB, 4 * GB), 25);
  assert.equal(shareOf(4 * GB, 4 * GB), 100);
  // A limit set under what is held, and a limit of nothing
  assert.equal(shareOf(5 * GB, 4 * GB), 100);
  assert.equal(shareOf(0, 0), 100);
});
