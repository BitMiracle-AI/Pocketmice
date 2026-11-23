import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ipLimitKey, rateLimit, takeAll } from './rateLimit.ts';

/** A clock the test sets itself */
function clock() {
  let time = 1_000_000;
  return {
    now: () => time,
    pass: (ms: number) => {
      time += ms;
    }
  };
}

test('a key may come limit times in a window: then there is no room, and another key is not affected', () => {
  const { now } = clock();
  const limit = rateLimit(3, 60_000, now);

  for (let i = 0; i < 3; i++) {
    assert.equal(limit.hasRoom('a'), true, `there should be room before time ${i + 1}`);
    limit.record('a');
  }

  assert.equal(limit.hasRoom('a'), false);
  assert.equal(limit.hasRoom('b'), true);
});

test('asking whether there is room counts nothing, however often', () => {
  const { now } = clock();
  const limit = rateLimit(1, 60_000, now);

  for (let i = 0; i < 10; i++) assert.equal(limit.hasRoom('a'), true);
  limit.record('a');

  assert.equal(limit.hasRoom('a'), false);
});

test('the window slides: each time gives its place back a window after it came, not all of them on the minute', () => {
  const { now, pass } = clock();
  const limit = rateLimit(2, 60_000, now);

  limit.record('a');
  pass(40_000);
  limit.record('a');
  assert.equal(limit.hasRoom('a'), false);

  // The first is a minute old: one place is free. The second is still inside the window
  pass(20_001);
  assert.equal(limit.hasRoom('a'), true);
  limit.record('a');
  assert.equal(limit.hasRoom('a'), false);

  // Forty seconds on, the second has left the window too
  pass(40_000);
  assert.equal(limit.hasRoom('a'), true);
});

test('several limits as one: a key comes when all have room and each counts it; when one is full none counts', () => {
  const { now, pass } = clock();
  const perMinute = rateLimit(2, 60_000, now);
  const perDay = rateLimit(3, 24 * 60 * 60_000, now);
  const both = [perMinute, perDay];

  assert.equal(takeAll(both, 'a'), true);
  assert.equal(takeAll(both, 'a'), true);
  // The minute is full: refused, and the day must not lose a place to a request that was refused
  assert.equal(takeAll(both, 'a'), false);
  assert.equal(takeAll(both, 'a'), false);

  pass(61_000);
  assert.equal(takeAll(both, 'a'), true, 'the day should have one place left');
  // Now it is the day that is full
  pass(61_000);
  assert.equal(perMinute.hasRoom('a'), true);
  assert.equal(takeAll(both, 'a'), false);
  assert.equal(perMinute.hasRoom('a'), true, 'the request that was refused should not count against the minute');
});

test('keys do not hold memory for ever: at ten thousand, the ones with nothing left in the window are dropped and the rest still count', () => {
  const { now, pass } = clock();
  const limit = rateLimit(1, 60_000, now);

  for (let i = 0; i < 9_000; i++) limit.record(`old-${i}`);
  assert.equal(limit.size(), 9_000);
  pass(61_000);
  limit.record('kept');
  // Another batch, up to the number that starts a sweep. Nobody asked about the nine thousand again after their
  // window passed: only a sweep takes them away
  for (let i = 0; i < 2_000; i++) limit.record(`new-${i}`);

  assert.equal(limit.size(), 2_001);
  assert.equal(limit.hasRoom('kept'), false, 'a key still inside the window must not be dropped');
  assert.equal(limit.hasRoom('new-0'), false);
  assert.equal(limit.hasRoom('old-0'), true);
});

test('many keys are left after a sweep: the next one waits for ten thousand more, and does not run on every request', () => {
  const { now, pass } = clock();
  const limit = rateLimit(1, 60_000, now);

  for (let i = 0; i < 10_000; i++) limit.record(`first-${i}`);
  // The ten thousandth started a sweep; all were inside the window, and none went
  assert.equal(limit.size(), 10_000);
  pass(61_000);
  // All ten thousand have left the window, and the number for the next sweep is not reached: they stay
  for (let i = 0; i < 5_000; i++) limit.record(`second-${i}`);
  assert.equal(limit.size(), 15_000);
  // Reached: the ones that left the window go at once
  for (let i = 5_000; i < 10_000; i++) limit.record(`second-${i}`);
  assert.equal(limit.size(), 10_000);
});

test('the key of an IP: an IPv4 address is its own; IPv6 addresses of one /64 share a key; an IPv4 written as IPv6 counts as that IPv4', () => {
  assert.equal(ipLimitKey('203.0.113.7'), '203.0.113.7');

  const home = ipLimitKey('2001:db8:1234:5678::1');
  assert.equal(ipLimitKey('2001:db8:1234:5678:aaaa:bbbb:cccc:dddd'), home);
  assert.equal(ipLimitKey('2001:DB8:1234:5678:0:0:0:2'), home);
  assert.equal(ipLimitKey('2001:0db8:1234:5678:ffff:ffff:ffff:ffff'), home);
  assert.notEqual(ipLimitKey('2001:db8:1234:5679::1'), home);
  assert.notEqual(ipLimitKey('2001:db8::1'), home);
  assert.notEqual(ipLimitKey('::1'), ipLimitKey('1::1'));

  assert.equal(ipLimitKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(ipLimitKey('::ffff:cb00:7107'), '203.0.113.7');
  assert.equal(ipLimitKey('0:0:0:0:0:ffff:203.0.113.7'), '203.0.113.7');

  // What is not an IP, and what cannot be parsed, is returned as it is
  assert.equal(ipLimitKey('unknown'), 'unknown');
  assert.equal(ipLimitKey('fe80::1%eth0'), 'fe80::1%eth0');
});
