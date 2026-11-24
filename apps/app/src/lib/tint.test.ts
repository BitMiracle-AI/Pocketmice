// To run it, in apps/app: node --test src/lib/tint.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TINTS, tintOf } from './tint.ts';

test('an id always has the same colour, and it is one of those there are', () => {
  const id = 'a86b5c8d-d943-4f3d-925f-e5a2bd1af078';
  assert.equal(tintOf(id), tintOf(id));
  for (const each of [id, '', 'x', '8429ef7d-f2ca-4c56-a1eb-717ec36a511a', '空间']) {
    const tint = tintOf(each);
    assert.ok(Number.isInteger(tint) && tint >= 1 && tint <= TINTS, `${each} has ${tint}`);
  }
});

test('ids as the api makes them are spread over all the colours', () => {
  const seen = new Map<number, number>();
  for (let n = 0; n < 600; n++) {
    const id = `${n.toString(16).padStart(8, '0')}-d943-4f3d-925f-${(n * 7919).toString(16).padStart(12, '0')}`;
    seen.set(tintOf(id), (seen.get(tintOf(id)) ?? 0) + 1);
  }
  assert.equal(seen.size, TINTS);
  // None is given to fewer than half of an even share
  for (const [tint, count] of seen) assert.ok(count > 600 / TINTS / 2, `colour ${tint} was given ${count} times`);
});
