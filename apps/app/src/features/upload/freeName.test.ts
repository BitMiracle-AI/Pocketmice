// To run it, in apps/app: node --test src/features/upload/freeName.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freeName } from './freeName.ts';

const taken = (...names: string[]) => new Set(names);

test('the number goes before the extension, and counts up until the name is free', () => {
  assert.equal(freeName('report.pdf', taken('report.pdf')), 'report (2).pdf');
  assert.equal(freeName('report.pdf', taken('report.pdf', 'report (2).pdf', 'report (3).pdf')), 'report (4).pdf');
});

test('a name with no extension, and one that starts with a dot, get the number at the end', () => {
  assert.equal(freeName('notes', taken('notes')), 'notes (2)');
  assert.equal(freeName('.env', taken('.env')), '.env (2)');
});

test('only the last extension counts as one', () => {
  assert.equal(freeName('archive.tar.gz', taken('archive.tar.gz')), 'archive.tar (2).gz');
});

test('a name that already ends in a number counts on from it', () => {
  assert.equal(freeName('report (2).pdf', taken('report.pdf', 'report (2).pdf')), 'report (3).pdf');
  assert.equal(freeName('report (9).pdf', taken('report (9).pdf', 'report (10).pdf')), 'report (11).pdf');
});

test('a name as long as a name may be loses the end of its stem, and keeps its extension', () => {
  const long = `${'a'.repeat(251)}.pdf`;
  const free = freeName(long, taken(long));
  assert.equal(free.length, 255);
  assert.ok(free.endsWith(' (2).pdf'));
  assert.ok(free.startsWith('aaa'));
});
