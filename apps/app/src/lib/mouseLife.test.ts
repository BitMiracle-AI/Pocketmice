// To run it, in apps/app: node --test src/lib/mouseLife.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIZZY_AT, LASTS, live, type Mouse, postureOf, ROW_WITHIN, SPOTS, START } from './mouseLife.ts';

/** Presses the mouse at `now` and lets it come all the way back up; returns it and the time it is then */
function pressAndWait(mouse: Mouse, now: number, chance = 0): [Mouse, number] {
  let next = live(mouse, { is: 'pressed', chance }, now);
  while (next.until !== null) next = live(next, { is: 'time' }, next.until);
  return [next, now + LASTS.away + LASTS.peeking];
}

test('pressed, it drops out of sight, looks over the edge somewhere else, and is back', () => {
  const away = live(START, { is: 'pressed', chance: 0 }, 1000);
  assert.equal(away.act, 'away');
  assert.equal(postureOf(away), 'ducked');
  assert.equal(away.until, 1000 + LASTS.away);
  // It drops where it is, and moves only once it is out of sight
  assert.equal(away.spot, START.spot);
  assert.notEqual(away.goes, START.spot);

  const peeking = live(away, { is: 'time' }, away.until ?? 0);
  assert.equal(peeking.act, 'peeking');
  assert.equal(postureOf(peeking), 'peek');
  assert.equal(peeking.spot, away.goes);

  const back = live(peeking, { is: 'time' }, peeking.until ?? 0);
  assert.deepEqual([back.act, back.until, postureOf(back)], ['idle', null, 'up']);
});

test('whatever the chance, it comes up at one of the other places', () => {
  for (let spot = 0; spot < SPOTS.length; spot++) {
    const seen = new Set<number>();
    for (const chance of [0, 0.2, 0.34, 0.5, 0.67, 0.9, 0.999999]) {
      const next = live({ ...START, spot, goes: spot }, { is: 'pressed', chance }, 0).goes;
      assert.ok(next >= 0 && next < SPOTS.length && next !== spot, `from ${spot} with ${chance}: ${next}`);
      seen.add(next);
    }
    assert.equal(seen.size, SPOTS.length - 1, `from ${spot} every other place is reached`);
  }
});

test('while it is out of sight a press is not felt', () => {
  const away = live(START, { is: 'pressed', chance: 0 }, 0);
  assert.equal(live(away, { is: 'pressed', chance: 0.5 }, 100), away);
});

test('pressed five times in a row it comes up dizzy, and a press is lost on it until that passes', () => {
  let mouse = START;
  let now = 0;
  for (let press = 1; press < DIZZY_AT; press++) {
    [mouse, now] = pressAndWait(mouse, now);
    assert.equal(mouse.act, 'idle', `after press ${press}`);
  }
  const away = live(mouse, { is: 'pressed', chance: 0 }, now);
  const dizzy = live(away, { is: 'time' }, away.until ?? 0);
  assert.equal(dizzy.act, 'dizzy');
  assert.equal(dizzy.spot, away.goes);
  assert.equal(postureOf(dizzy), 'up');
  assert.equal(live(dizzy, { is: 'pressed', chance: 0 }, (dizzy.until ?? 0) - 1), dizzy);

  // It starts counting anew
  const well = live(dizzy, { is: 'time' }, dizzy.until ?? 0);
  assert.equal(well.act, 'idle');
  const [again] = pressAndWait(well, (dizzy.until ?? 0) + 10);
  assert.equal(again.act, 'idle');
});

test('presses with a pause between them are not a row', () => {
  let mouse = START;
  let now = 0;
  for (let press = 0; press < DIZZY_AT * 2; press++) {
    [mouse] = pressAndWait(mouse, now);
    assert.equal(mouse.act, 'idle');
    now += ROW_WITHIN + 1;
  }
});

test('it is shy while a password is typed, whatever else it does, and not when it is out of sight', () => {
  const shy = live(START, { is: 'secret', on: true }, 0);
  assert.equal(postureOf(shy), 'shy');
  assert.equal(postureOf(live(shy, { is: 'refused' }, 10)), 'shy');
  assert.equal(postureOf(live(shy, { is: 'pressed', chance: 0 }, 10)), 'ducked');
  assert.equal(postureOf(live(shy, { is: 'secret', on: false }, 20)), 'up');
  assert.equal(live(shy, { is: 'secret', on: true }, 30), shy);
});

test('a refusal makes it shake its head for a moment', () => {
  const no = live(START, { is: 'refused' }, 500);
  assert.deepEqual([no.act, no.until], ['no', 500 + LASTS.no]);
  assert.equal(live(no, { is: 'time' }, no.until ?? 0).act, 'idle');
  // Not while it is away: it did not see
  const away = live(START, { is: 'pressed', chance: 0 }, 0);
  assert.equal(live(away, { is: 'refused' }, 10), away);
});

test('stroked it is happy for as long as the stroking goes on, and a moment more', () => {
  const happy = live(START, { is: 'petted' }, 0);
  assert.deepEqual([happy.act, happy.until], ['happy', LASTS.happy]);
  const still = live(happy, { is: 'petted' }, 600);
  assert.deepEqual([still.act, still.until], ['happy', 600 + LASTS.happy]);
  assert.equal(live(still, { is: 'time' }, still.until ?? 0).act, 'idle');
  // Sunk for a password, it does not feel it
  const shy = live(START, { is: 'secret', on: true }, 0);
  assert.equal(live(shy, { is: 'petted' }, 10), shy);
});

test('left alone it falls asleep, and wakes with a start when the person stirs', () => {
  const asleep = live(START, { is: 'left alone' }, 0);
  assert.deepEqual([asleep.act, asleep.until], ['asleep', null]);
  assert.equal(live(asleep, { is: 'time' }, 99_999), asleep);
  const startled = live(asleep, { is: 'stirred' }, 5000);
  assert.deepEqual([startled.act, startled.until], ['startled', 5000 + LASTS.startled]);
  assert.equal(live(startled, { is: 'time' }, startled.until ?? 0).act, 'idle');
});

test('it does not fall asleep in the middle of something, and stirring is nothing to one that is awake', () => {
  const happy = live(START, { is: 'petted' }, 0);
  assert.equal(live(happy, { is: 'left alone' }, 10), happy);
  const shy = live(START, { is: 'secret', on: true }, 0);
  assert.equal(live(shy, { is: 'left alone' }, 10), shy);
  assert.equal(live(START, { is: 'stirred' }, 10), START);
});
