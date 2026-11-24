// To run it, in apps/app: node --test src/lib/gaze.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gaze, typingPoint } from './gaze.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('the eyes turn all the way toward a point that is far, in its direction', () => {
  assert.deepEqual(gaze({ x: 100, y: 100 }, { x: 900, y: 100 }, 240), { x: 1, y: 0 });
  assert.deepEqual(gaze({ x: 100, y: 100 }, { x: 100, y: -500 }, 240), { x: 0, y: -1 });
  const down = gaze({ x: 0, y: 0 }, { x: 300, y: 400 }, 240);
  assert.ok(near(down.x, 0.6) && near(down.y, 0.8), JSON.stringify(down));
});

test('a nearer point turns them less, and one on the eyes themselves not at all', () => {
  assert.deepEqual(gaze({ x: 0, y: 0 }, { x: 60, y: 0 }, 240), { x: 0.25, y: 0 });
  assert.deepEqual(gaze({ x: 40, y: 40 }, { x: 40, y: 40 }, 240), { x: 0, y: 0 });
});

test('however far the point, the turn is never longer than all the way', () => {
  for (const to of [
    { x: 5000, y: 5000 },
    { x: -1, y: 9999 },
    { x: -240, y: 0 },
    { x: 170, y: -170 }
  ]) {
    const turned = gaze({ x: 0, y: 0 }, to, 240);
    assert.ok(Math.hypot(turned.x, turned.y) <= 1 + 1e-9, JSON.stringify(turned));
  }
});

test('in a field of text, what is typed is looked at where it ends, and no further than the field goes', () => {
  const box = { left: 100, top: 200, width: 320, height: 44 };
  const field = { boxes: null, characterWidth: 8, inset: 20 };
  assert.deepEqual(typingPoint(box, 0, field), { x: 120, y: 222 });
  assert.deepEqual(typingPoint(box, 10, field), { x: 200, y: 222 });
  assert.deepEqual(typingPoint(box, 500, field), { x: 400, y: 222 });
});

test('in a code of six boxes, the box that is typed next is looked at, and the last one when all are full', () => {
  const box = { left: 0, top: 0, width: 300, height: 48 };
  const field = { boxes: 6, characterWidth: 8, inset: 20 };
  assert.deepEqual(typingPoint(box, 0, field), { x: 25, y: 24 });
  assert.deepEqual(typingPoint(box, 3, field), { x: 175, y: 24 });
  assert.deepEqual(typingPoint(box, 6, field), { x: 275, y: 24 });
});
