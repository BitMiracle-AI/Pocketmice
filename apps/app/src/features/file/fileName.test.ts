// To run it, in apps/app: node --test src/features/file/fileName.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stemLength } from './fileName.ts';

test('the stem of a name ends before its last extension', () => {
  assert.equal(stemLength('report.pdf'), 6);
  assert.equal(stemLength('archive.tar.gz'), 11);
});

test('a name without an extension is all stem', () => {
  assert.equal(stemLength('README'), 6);
  assert.equal(stemLength(''), 0);
});

test('a dot at the very start does not begin an extension', () => {
  assert.equal(stemLength('.env'), 4);
  assert.equal(stemLength('.env.local'), 4);
});
