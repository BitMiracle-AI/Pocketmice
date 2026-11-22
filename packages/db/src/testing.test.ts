import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staleTestDbNames, testDbName } from './testing.ts';

const PREFIX = 'pocketmice_test_';
const NOW = new Date('2026-11-10T12:00:00Z');

/** The name of a test database created this many minutes before NOW */
function createdMinutesAgo(minutes: number): string {
  return testDbName(PREFIX, new Date(NOW.getTime() - minutes * 60_000));
}

test('the name of a test database carries the time it was created, in UTC; two names are never the same', () => {
  const first = testDbName(PREFIX, new Date('2026-11-10T09:08:07Z'));
  const second = testDbName(PREFIX, new Date('2026-11-10T09:08:07Z'));

  assert.match(first, /^pocketmice_test_20261110090807_[0-9a-f]{8}$/);
  assert.notEqual(first, second);
});

test('a test database created over an hour ago is left behind; one created within the hour is not', () => {
  const twoHours = createdMinutesAgo(120);
  const justOver = createdMinutesAgo(61);
  const justUnder = createdMinutesAgo(59);
  const fresh = createdMinutesAgo(0);

  assert.deepEqual(staleTestDbNames([twoHours, justOver, justUnder, fresh], PREFIX, NOW), [twoHours, justOver]);
});

test('a database whose name does not fit the pattern is never a test database left behind, however old', () => {
  const others = [
    // The development database
    'pocketmice',
    'pocketmice_test',
    // The right prefix, but not followed by a time and random characters
    'pocketmice_test_probe_tpl_b46ovx',
    'pocketmice_test_20200101000000',
    'pocketmice_test_20200101000000_xyz12345',
    'pocketmice_test_20200101000000_0123abcd_copy',
    // The databases of other projects
    'other_test_20200101000000_0123abcd',
    'postgres'
  ];

  assert.deepEqual(staleTestDbNames(others, PREFIX, NOW), []);
});
