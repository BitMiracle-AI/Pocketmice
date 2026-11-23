// To run it, in apps/app: node --test src/lib/format.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate, formatMoment, formatSize, formatWhen } from './format.ts';

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
