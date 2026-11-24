// To run it, in apps/app: node --test src/features/file/fileOrder.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { getFile } from '@pocketmice/contract/domains/file';
import type { OutputOf } from '@pocketmice/contract/operation';
import { foldersAbove, foldersToFind, inOrder, isWithin, placeOf } from './fileOrder.ts';

type DriveFile = OutputOf<typeof getFile>['file'];

function entry(name: string, kind: 'file' | 'folder' = 'file'): DriveFile {
  return {
    id: name,
    parentId: null,
    name,
    kind,
    description: '',
    path: `/${name}`,
    version: null,
    createdAt: '2026-11-23T00:00:00.000Z',
    updatedAt: '2026-11-23T00:00:00.000Z'
  };
}

const english = new Intl.Collator('en', { numeric: true }).compare;
const names = (files: DriveFile[]) => files.map((file) => file.name);

test('folders come first, then files, each by name', () => {
  const listed = [entry('b.txt'), entry('Zebra', 'folder'), entry('a.txt'), entry('alpha', 'folder')];

  assert.deepEqual(names(inOrder(listed, english)), ['alpha', 'Zebra', 'a.txt', 'b.txt']);
});

test('a number in a name counts as a number: file2 comes before file10', () => {
  const listed = [entry('file10.txt'), entry('file2.txt'), entry('file1.txt')];

  assert.deepEqual(names(inOrder(listed, english)), ['file1.txt', 'file2.txt', 'file10.txt']);
});

test('names the comparison takes for equal keep one order, whichever way they came', () => {
  const same = () => 0;

  assert.deepEqual(names(inOrder([entry('b'), entry('a'), entry('B')], same)), ['B', 'a', 'b']);
  assert.deepEqual(names(inOrder([entry('B'), entry('b'), entry('a')], same)), ['B', 'a', 'b']);
});

test('the list that was handed in is left as it was', () => {
  const listed = [entry('b'), entry('a')];
  inOrder(listed, english);

  assert.deepEqual(names(listed), ['b', 'a']);
});

test('the folders above a folder are read from its path, each with the path that leads to it', () => {
  assert.deepEqual(foldersAbove('/Reports/2026/Q3'), [
    { name: 'Reports', path: '/Reports' },
    { name: '2026', path: '/Reports/2026' }
  ]);
  assert.deepEqual(foldersAbove('/Reports'), []);
});

test('where something is, is the names of the folders above it; directly in the space it is nowhere', () => {
  assert.equal(placeOf('/Reports/2026/summary.md'), 'Reports / 2026');
  assert.equal(placeOf('/Reports/2026'), 'Reports');
  assert.equal(placeOf('/summary.md'), null);
});

test('something is within a folder when it is that folder, or is inside it however deep', () => {
  assert.equal(isWithin('/Reports', '/Reports'), true);
  assert.equal(isWithin('/Reports/2026/plan.txt', '/Reports'), true);
  assert.equal(isWithin('/Reports/2026/plan.txt', '/Reports/2026'), true);
  // A name that begins with the name of another folder is not inside that folder
  assert.equal(isWithin('/Reports 2026', '/Reports'), false);
  assert.equal(isWithin('/Reports', '/Reports/2026'), false);
  assert.equal(isWithin('/Other/Reports', '/Reports'), false);
});

test('the folders to ask for are the ones above, but for the one right above', () => {
  assert.deepEqual(foldersToFind('/a.txt'), []);
  assert.deepEqual(foldersToFind('/Reports/a.txt'), []);
  assert.deepEqual(foldersToFind('/Reports/2026/Q4/a.txt'), [
    { name: 'Reports', path: '/Reports' },
    { name: '2026', path: '/Reports/2026' }
  ]);
});
