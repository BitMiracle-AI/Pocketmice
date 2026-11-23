// To run it, in apps/app: node --test src/lib/format.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBrief, formatDate, formatDay, formatMoment, formatSize, formatTime, formatWhen } from './format.ts';

test('a size is written in the largest unit it fills, in steps of 1024', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1023), '1,023 B');
  assert.equal(formatSize(1024), '1 KB');
  assert.equal(formatSize(1843), '1.8 KB');
  assert.equal(formatSize(150 * 1024), '150 KB');
  assert.equal(formatSize(2.4 * 1024 * 1024), '2.4 MB');
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(5 * 1024 ** 5), '5,120 TB');
});

const NOW = Date.parse('2026-11-23T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('a time within the week is said as how long ago it was', () => {
  assert.equal(formatWhen(ago(20_000), NOW), 'now');
  assert.equal(formatWhen(ago(12 * MINUTE), NOW), '12 minutes ago');
  assert.equal(formatWhen(ago(3 * HOUR), NOW), '3 hours ago');
  assert.equal(formatWhen(ago(DAY), NOW), 'yesterday');
  assert.equal(formatWhen(ago(6 * DAY), NOW), '6 days ago');
});

test('older than a week, it is the date', () => {
  assert.equal(formatWhen('2026-11-01T09:00:00Z', NOW), formatDate('2026-11-01T09:00:00Z'));
  assert.match(formatDate('2026-11-01T12:00:00Z'), /^Nov 1, 2026$/);
});

test('a moment is the day and the time to the second, in the time of the place the page is read in', () => {
  // What hour it is depends on where the test runs: the seconds and the shape of the rest do not
  assert.match(formatMoment('2026-11-01T12:05:09Z'), /^(Oct 31|Nov [12]), 2026, \d{1,2}:(05|35|50):09\s?[AP]M$/);
  assert.match(formatMoment('2026-11-01T12:05:09Z', 'zh-hans'), /^2026年1[01]月\d{1,2}日 \d{1,2}:(05|35|50):09$/);
});

test('each is written the way its language writes it', () => {
  assert.equal(formatSize(1843, 'zh-hans'), '1.8 KB');
  assert.equal(formatWhen(ago(12 * MINUTE), NOW, 'zh-hans'), '12分钟前');
  assert.equal(formatWhen(ago(DAY), NOW, 'zh-hans'), '昨天');
  assert.match(formatDate('2026-11-01T12:00:00Z', 'zh-hans'), /^2026年11月1日$/);
});

// Days are counted where the page is read, so these times are written in the time of the place the test runs in
const at = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();
const NOON = new Date(2026, 10, 23, 12, 0).getTime();

test('a day is headed Today or Yesterday, and before that by its date, whatever the hour', () => {
  assert.equal(formatDay(at(2026, 11, 23, 0, 1), NOON), 'Today');
  assert.equal(formatDay(at(2026, 11, 23, 23, 59), NOON), 'Today');
  assert.equal(formatDay(at(2026, 11, 22, 23, 59), NOON), 'Yesterday');
  assert.equal(formatDay(at(2026, 11, 21, 12), NOON), 'Nov 21, 2026');
  // By the calendar and not by the hours between: forty minutes ago was yesterday just after midnight, and
  // twenty-three hours ago is today just before it
  const afterMidnight = new Date(2026, 10, 23, 0, 30).getTime();
  const beforeMidnight = new Date(2026, 10, 23, 23, 30).getTime();
  assert.equal(formatDay(at(2026, 11, 22, 23, 50), afterMidnight), 'Yesterday');
  assert.equal(formatDay(at(2026, 11, 23, 0, 10), beforeMidnight), 'Today');
  assert.match(formatBrief(at(2026, 11, 23, 0, 10), beforeMidnight), /^12:10\s?AM$/);
  assert.equal(formatBrief(at(2026, 11, 22, 23, 50), afterMidnight), 'Yesterday');
  assert.equal(formatDay(at(2026, 11, 22, 9), NOON, 'zh-hans'), '昨天');
  assert.equal(formatDay(at(2026, 11, 23, 9), NOON, 'zh-hans'), '今天');
});

test('the time of day is the hour and the minute', () => {
  assert.match(formatTime(at(2026, 11, 23, 14, 5)), /^2:05\s?PM$/);
  assert.equal(formatTime(at(2026, 11, 23, 14, 5), 'zh-hans'), '14:05');
});

test('in a narrow list a time is the time of day for today, Yesterday, then the day, with the year when it is another', () => {
  assert.match(formatBrief(at(2026, 11, 23, 9, 30), NOON), /^9:30\s?AM$/);
  assert.equal(formatBrief(at(2026, 11, 22, 9, 30), NOON), 'Yesterday');
  assert.equal(formatBrief(at(2026, 11, 2, 9, 30), NOON), 'Nov 2');
  assert.equal(formatBrief(at(2025, 12, 31, 9, 30), NOON), 'Dec 31, 2025');
  assert.equal(formatBrief(at(2026, 11, 2, 9, 30), NOON, 'zh-hans'), '11月2日');
});
