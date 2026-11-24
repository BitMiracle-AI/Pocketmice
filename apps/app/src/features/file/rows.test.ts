// To run it, in apps/app: node --test src/features/file/rows.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rowsOf } from './rows.ts';

test('a row to a line, the values with the separator between them', () => {
  assert.deepEqual(rowsOf('name,size\nnotes.md,120\n', ',', false), [
    ['name', 'size'],
    ['notes.md', '120']
  ]);
  assert.deepEqual(rowsOf('name\tsize\nwith, a comma\t120', '\t', false), [
    ['name', 'size'],
    ['with, a comma', '120']
  ]);
});

test('a value in double quotes holds separators, line ends and doubled quotes as they are', () => {
  assert.deepEqual(rowsOf('a,"b, c",d\n"two\nlines","she said ""hi""",""\n', ',', false), [
    ['a', 'b, c', 'd'],
    ['two\nlines', 'she said "hi"', '']
  ]);
});

test('a double quote that does not begin a value is that character', () => {
  assert.deepEqual(rowsOf('5" disk,x\n', ',', false), [['5" disk', 'x']]);
});

test('a line ends with a line feed, a carriage return, or both, and a line with nothing on it is no row', () => {
  assert.deepEqual(rowsOf('a,b\r\nc,d\re,f\n\n\ng,h', ',', false), [
    ['a', 'b'],
    ['c', 'd'],
    ['e', 'f'],
    ['g', 'h']
  ]);
  assert.deepEqual(rowsOf('', ',', false), []);
  assert.deepEqual(rowsOf('\n\n', ',', false), []);
});

test('values that are empty are kept, and rows need not be of one length', () => {
  assert.deepEqual(rowsOf('a,,c\n,\nx\n', ',', false), [['a', '', 'c'], ['', ''], ['x']]);
});

test('of the start of a file, a last row that no line end closes is left out', () => {
  assert.deepEqual(rowsOf('a,b\nc,d\ne,', ',', true), [
    ['a', 'b'],
    ['c', 'd']
  ]);
  // The cut went through a value in quotes
  assert.deepEqual(rowsOf('a,b\n"c, and more', ',', true), [['a', 'b']]);
  // It fell right after a line end: every row is whole
  assert.deepEqual(rowsOf('a,b\nc,d\n', ',', true), [
    ['a', 'b'],
    ['c', 'd']
  ]);
  // One long line is shown as far as it goes
  assert.deepEqual(rowsOf('a,b,c', ',', true), [['a', 'b', 'c']]);
});
