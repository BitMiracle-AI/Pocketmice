import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFolder,
  FILE_DESCRIPTION_MAX_LENGTH,
  FILE_NAME_MAX_LENGTH,
  FILE_PATH_MAX_LENGTH,
  fileDescription,
  fileName,
  filePath,
  getFiles,
  namesOfPath,
  newFileQuery,
  newVersionQuery,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  pathOfNames,
  updateFile
} from './file.ts';

const SPACE = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';

test('the name of a file is trimmed, and is compared as it is written', () => {
  assert.equal(fileName.parse('  Quarterly report.md '), 'Quarterly report.md');
  // A name may have spaces and dots in it, start with a dot, and be in any script
  for (const name of ['a', '.env', 'a b', 'notes.2026.md', '报告', '...', 'a'.repeat(FILE_NAME_MAX_LENGTH)]) {
    assert.equal(fileName.safeParse(name).success, true, `"${name.slice(0, 20)}"`);
  }
});

test('a name that is empty, too long, . or .., or has a / or a control character in it is refused', () => {
  for (const name of ['', '   ', '.', '..', ' .. ', 'a/b', '/', 'a\nb', 'a\tb', 'a\u0000b', 'a\u007fb']) {
    assert.equal(fileName.safeParse(name).success, false, JSON.stringify(name));
  }
  assert.equal(fileName.safeParse('a'.repeat(FILE_NAME_MAX_LENGTH + 1)).success, false);
});

test('a description is trimmed, may be empty, and has a limit', () => {
  assert.equal(fileDescription.parse('  Raw data. Do not edit. '), 'Raw data. Do not edit.');
  assert.equal(fileDescription.parse('   '), '');
  assert.equal(fileDescription.safeParse('a'.repeat(FILE_DESCRIPTION_MAX_LENGTH)).success, true);
  assert.equal(fileDescription.safeParse('a'.repeat(FILE_DESCRIPTION_MAX_LENGTH + 1)).success, false);
});

test('a path is the names from the top down, each after a /, and reads back as the same names', () => {
  assert.deepEqual(namesOfPath('/Reports'), ['Reports']);
  assert.deepEqual(namesOfPath('/Reports/2026/Quarterly report.md'), ['Reports', '2026', 'Quarterly report.md']);
  assert.equal(pathOfNames(['Reports', '2026', 'Quarterly report.md']), '/Reports/2026/Quarterly report.md');
  assert.equal(filePath.safeParse('/Reports/2026').success, true);
});

test('text that is not a path is refused: no / in front, an empty name, a name no file can have, or too long', () => {
  for (const path of [
    '',
    '/',
    'Reports',
    'Reports/2026',
    '/Reports/',
    '//Reports',
    '/Reports//2026',
    '/a/../b',
    '/a/.'
  ]) {
    assert.equal(namesOfPath(path), null, `"${path}"`);
    assert.equal(filePath.safeParse(path).success, false, `"${path}"`);
  }
  // A name is not trimmed inside a path: what is asked for is the file of exactly that name
  assert.equal(namesOfPath('/Reports /2026'), null);
  assert.equal(namesOfPath(`/${'a/'.repeat(FILE_PATH_MAX_LENGTH / 2)}a`), null);
});

test('createFolder says where: parentId is a folder, or null for directly in the space, and cannot be left out', () => {
  const input = createFolder.input;

  assert.deepEqual(input.parse({ spaceId: SPACE, parentId: null, name: 'Reports' }), {
    spaceId: SPACE,
    parentId: null,
    name: 'Reports',
    description: ''
  });
  assert.equal(input.safeParse({ spaceId: SPACE, parentId: FILE, name: 'Reports' }).success, true);
  assert.equal(input.safeParse({ spaceId: SPACE, name: 'Reports' }).success, false);
});

test('updateFile takes a name, a description or both, and refuses a change of nothing', () => {
  const input = updateFile.input;

  assert.equal(input.safeParse({ spaceId: SPACE, fileId: FILE, name: 'Reports' }).success, true);
  // An empty description is a change: it takes the description away
  assert.equal(input.safeParse({ spaceId: SPACE, fileId: FILE, description: '' }).success, true);
  assert.equal(input.safeParse({ spaceId: SPACE, fileId: FILE, name: 'Reports', description: 'x' }).success, true);
  assert.equal(input.safeParse({ spaceId: SPACE, fileId: FILE }).success, false);
  // A field that is misspelled is dropped, so nothing is left to change
  assert.equal(input.safeParse({ spaceId: SPACE, fileId: FILE, descripton: 'x' }).success, false);
});

test('a page has the default size when limit is left out, and never more than the largest', () => {
  const input = getFiles.input;

  assert.equal(input.parse({ spaceId: SPACE, parentId: null }).limit, PAGE_SIZE_DEFAULT);
  assert.equal(input.parse({ spaceId: SPACE, parentId: null, limit: PAGE_SIZE_MAX }).limit, PAGE_SIZE_MAX);
  for (const limit of [0, -1, 1.5, PAGE_SIZE_MAX + 1]) {
    assert.equal(input.safeParse({ spaceId: SPACE, parentId: null, limit }).success, false, `${limit}`);
  }
});

test('the query of an upload says a new file or a new version, and refuses a parameter it does not know', () => {
  // Left out, parentId means directly in the space: a query cannot say null
  assert.deepEqual(newFileQuery.parse({ spaceId: SPACE, name: ' report.md ' }), { spaceId: SPACE, name: 'report.md' });
  assert.equal(newFileQuery.safeParse({ spaceId: SPACE, parentId: FILE, name: 'report.md' }).success, true);
  assert.equal(newFileQuery.safeParse({ spaceId: SPACE, name: 'a/b' }).success, false);
  // A misspelled parameter is not dropped: the file would land somewhere the caller did not mean
  assert.equal(newFileQuery.safeParse({ spaceId: SPACE, parentid: FILE, name: 'report.md' }).success, false);

  assert.equal(newVersionQuery.safeParse({ spaceId: SPACE, fileId: FILE, baseVersionId: FILE }).success, true);
  // Writing over a file without saying which version is replaced is not a query
  assert.equal(newVersionQuery.safeParse({ spaceId: SPACE, fileId: FILE }).success, false);
});
