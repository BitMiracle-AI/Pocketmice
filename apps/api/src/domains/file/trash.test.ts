import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFolder,
  getFile,
  getFileByPath,
  getFiles,
  getTrashedFiles,
  moveFile,
  restoreFile,
  trashFile,
  updateFile
} from '@pocketmice/contract/domains/file';
import { createSpace } from '@pocketmice/contract/domains/space';
import { files } from '@pocketmice/db/schema/file';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes a folder as this person, in the folder parentId or directly in the space, and returns it */
async function makeFolder(person: CurrentUser, spaceId: string, parentId: string | null, name: string) {
  const result = await api.as(person)(createFolder, { spaceId, parentId, name });
  assert.ok(result.ok, `createFolder "${name}" should have worked: ${JSON.stringify(result)}`);
  return result.data.file;
}

/** Puts a file in the trash as this person */
async function trash(person: CurrentUser, spaceId: string, fileId: string) {
  const result = await api.as(person)(trashFile, { spaceId, fileId });
  assert.deepEqual(result, { ok: true, data: {} });
}

/** The names of what is in a place, as this person sees them */
async function namesIn(person: CurrentUser, spaceId: string, parentId: string | null) {
  const result = await api.as(person)(getFiles, { spaceId, parentId });
  assert.ok(result.ok, `getFiles should have worked: ${JSON.stringify(result)}`);
  return result.data.files.map((file) => file.name);
}

/** The paths of what was put in the trash of a space, as this person sees them: the latest first */
async function trashOf(person: CurrentUser, spaceId: string) {
  const result = await api.as(person)(getTrashedFiles, { spaceId });
  assert.ok(result.ok, `getTrashedFiles should have worked: ${JSON.stringify(result)}`);
  return result.data.files.map((file) => file.path);
}

/** Every operation but the two of the trash, tried on this file: the error codes they answer with */
async function everythingOn(person: CurrentUser, spaceId: string, file: { id: string; path: string }) {
  const call = api.as(person);
  const results = [
    await call(getFile, { spaceId, fileId: file.id }),
    await call(getFileByPath, { spaceId, path: file.path }),
    await call(getFiles, { spaceId, parentId: file.id }),
    await call(createFolder, { spaceId, parentId: file.id, name: 'Inside' }),
    await call(updateFile, { spaceId, fileId: file.id, name: 'Renamed' }),
    await call(moveFile, { spaceId, fileId: file.id, parentId: null }),
    await call(trashFile, { spaceId, fileId: file.id })
  ];
  return results.map((result) => (result.ok ? 'ok' : result.code));
}

const NOT_THERE = Array.from({ length: 7 }, () => 'NOT_FOUND');

test('a trashed file does not exist for any operation but the two of the trash, and its row is still there', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const kept = await makeFolder(ada, spaceId, null, 'Kept');
  const before = Date.now();

  await trash(ada, spaceId, reports.id);

  assert.deepEqual(await namesIn(ada, spaceId, null), ['Kept']);
  assert.deepEqual(await everythingOn(ada, spaceId, reports), NOT_THERE);
  // Nothing can be moved into it either
  const into = await api.as(ada)(moveFile, { spaceId, fileId: kept.id, parentId: reports.id });
  assert.equal(!into.ok && into.code, 'NOT_FOUND');
  // Nothing was removed: the row is marked with the time
  const [row] = await api.db.select().from(files).where(eq(files.id, reports.id));
  assert.equal(row?.name, 'Reports');
  assert.ok(row?.deletedAt && Math.abs(row.deletedAt.getTime() - before) < 60_000);
});

test('what is in a trashed folder is in the trash with it, though only the folder is marked and listed', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  const quarter = await makeFolder(ada, spaceId, year.id, 'Q1');

  await trash(ada, spaceId, reports.id);

  assert.deepEqual(await everythingOn(ada, spaceId, year), NOT_THERE);
  assert.deepEqual(await everythingOn(ada, spaceId, quarter), NOT_THERE);
  const marks = await api.db
    .select({ name: files.name, deletedAt: files.deletedAt })
    .from(files)
    .where(eq(files.spaceId, spaceId));
  assert.deepEqual(
    marks.filter((row) => row.deletedAt !== null).map((row) => row.name),
    ['Reports']
  );
  assert.deepEqual(await trashOf(ada, spaceId), ['/Reports']);
  // It has no mark of its own to take away: it comes back with the folder
  const alone = await api.as(ada)(restoreFile, { spaceId, fileId: quarter.id });
  assert.equal(!alone.ok && alone.code, 'NOT_FOUND');
});

test('restoreFile puts a folder back where it was, with everything in it', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  const quarter = await makeFolder(ada, spaceId, year.id, 'Q1');
  await trash(ada, spaceId, year.id);

  const restored = await api.as(ada)(restoreFile, { spaceId, fileId: year.id });

  // It is back as it was: the trash changed nothing about it, the time it last changed included
  assert.deepEqual(restored, { ok: true, data: { file: year } });
  assert.equal(year.path, '/Reports/2026');
  assert.deepEqual(await api.as(ada)(getFile, { spaceId, fileId: quarter.id }), { ok: true, data: { file: quarter } });
  assert.deepEqual(await namesIn(ada, spaceId, reports.id), ['2026']);
  assert.deepEqual(await trashOf(ada, spaceId), []);
  const [row] = await api.db.select().from(files).where(eq(files.id, year.id));
  assert.equal(row?.deletedAt, null);
});

test('trashing frees the name; restoring where the name was taken meanwhile is CONFLICT until it is free again', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await makeFolder(ada, spaceId, null, 'Reports');
  await trash(ada, spaceId, first.id);
  const second = await makeFolder(ada, spaceId, null, 'Reports');

  const refused = await api.as(ada)(restoreFile, { spaceId, fileId: first.id });

  assert.equal(!refused.ok && refused.code, 'CONFLICT');
  assert.deepEqual(await trashOf(ada, spaceId), ['/Reports']);
  // Two files of one name can both be in the trash
  await trash(ada, spaceId, second.id);
  assert.deepEqual(await trashOf(ada, spaceId), ['/Reports', '/Reports']);
  // With the name free, the first comes back; then the second is the one in the way
  assert.equal((await api.as(ada)(restoreFile, { spaceId, fileId: first.id })).ok, true);
  const other = await api.as(ada)(restoreFile, { spaceId, fileId: second.id });
  assert.equal(!other.ok && other.code, 'CONFLICT');
  assert.equal((await api.as(ada)(updateFile, { spaceId, fileId: first.id, name: 'Reports 2025' })).ok, true);
  assert.equal((await api.as(ada)(restoreFile, { spaceId, fileId: second.id })).ok, true);
  assert.deepEqual(await namesIn(ada, spaceId, null), ['Reports', 'Reports 2025']);
});

test('a file trashed on its own, whose folder was trashed after it, is restored only once the folder is', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  await trash(ada, spaceId, year.id);
  await trash(ada, spaceId, reports.id);
  assert.deepEqual((await trashOf(ada, spaceId)).sort(), ['/Reports', '/Reports/2026']);

  const tooEarly = await api.as(ada)(restoreFile, { spaceId, fileId: year.id });
  assert.equal(!tooEarly.ok && tooEarly.code, 'CONFLICT');

  assert.equal((await api.as(ada)(restoreFile, { spaceId, fileId: reports.id })).ok, true);
  // The folder is back; what was trashed on its own before is still in the trash
  assert.deepEqual(await namesIn(ada, spaceId, reports.id), []);
  assert.deepEqual(await trashOf(ada, spaceId), ['/Reports/2026']);
  const restored = await api.as(ada)(restoreFile, { spaceId, fileId: year.id });
  assert.equal(restored.ok && restored.data.file.path, '/Reports/2026');
});

test('restoreFile of a file that is not in the trash, or not in this space, is NOT_FOUND', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const elsewhere = await makeFolder(ada, otherSpaceId, null, 'Elsewhere');
  await trash(ada, otherSpaceId, elsewhere.id);

  for (const fileId of [reports.id, NOBODY, elsewhere.id]) {
    const result = await api.as(ada)(restoreFile, { spaceId, fileId });
    assert.equal(!result.ok && result.code, 'NOT_FOUND', fileId);
  }

  assert.deepEqual(await trashOf(ada, otherSpaceId), ['/Elsewhere']);
});

test('getTrashedFiles lists what was trashed in the space, the latest first, each with where it was and when', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  const drafts = await makeFolder(ada, spaceId, null, 'Drafts');
  const elsewhere = await makeFolder(ada, otherSpaceId, null, 'Elsewhere');
  await makeFolder(ada, spaceId, null, 'Kept');
  for (const [inSpace, file] of [
    [spaceId, year],
    [spaceId, drafts],
    [otherSpaceId, elsewhere]
  ] as const) {
    await trash(ada, inSpace, file.id);
  }
  // The times are set by hand, a day apart, so that the order does not hang on how fast the test ran
  await api.db
    .update(files)
    .set({ deletedAt: new Date('2026-03-01T10:00:00.000Z') })
    .where(eq(files.id, year.id));
  await api.db
    .update(files)
    .set({ deletedAt: new Date('2026-03-02T10:00:00.000Z') })
    .where(eq(files.id, drafts.id));

  const result = await api.as(ada)(getTrashedFiles, { spaceId });

  assert.ok(result.ok);
  assert.deepEqual(
    result.data.files.map((file) => [file.id, file.path, file.parentId, file.trashedAt]),
    [
      [drafts.id, '/Drafts', null, '2026-03-02T10:00:00.000Z'],
      [year.id, '/Reports/2026', reports.id, '2026-03-01T10:00:00.000Z']
    ]
  );
  assert.equal(result.data.nextCursor, null);
});

test('getTrashedFiles comes a page at a time, also through files trashed at the same moment', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const made = [];
  for (const name of ['a', 'b', 'c', 'd', 'e']) {
    const folder = await makeFolder(ada, spaceId, null, name);
    await trash(ada, spaceId, folder.id);
    made.push(folder);
  }
  // a alone at the earliest time, e alone at the latest, and b, c, d at one moment between them
  const at = (name: string) => (name === 'a' ? '09' : name === 'e' ? '11' : '10');
  for (const folder of made) {
    await api.db
      .update(files)
      .set({ deletedAt: new Date(`2026-03-01T${at(folder.name)}:00:00.000Z`) })
      .where(eq(files.id, folder.id));
  }

  const pages: string[][] = [];
  let cursor: string | undefined;
  do {
    const page = await api.as(ada)(getTrashedFiles, { spaceId, limit: 2, cursor });
    assert.ok(page.ok);
    pages.push(page.data.files.map((file) => file.name));
    cursor = page.data.nextCursor ?? undefined;
  } while (cursor !== undefined);

  // Every file once and none missing, the latest first; the three of one moment may come in any order among them
  assert.deepEqual(
    pages.map((page) => page.length),
    [2, 2, 1]
  );
  const all = pages.flat();
  assert.equal(all[0], 'e');
  assert.equal(all[4], 'a');
  assert.deepEqual(all.slice(1, 4).sort(), ['b', 'c', 'd']);
});

test('a cursor that getTrashedFiles did not give out is INVALID_INPUT', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);

  for (const cursor of [
    '',
    'abc',
    '2026-03-01T10:00:00.000Z',
    `2026-03-01T10:00:00.000Z_${NOBODY}x`,
    // Shaped like a cursor, with a time that is none: it used to reach the database, which refused it as INTERNAL
    `2026-13-45T99:99:99.999Z_${NOBODY}`,
    `2026-02-30T10:00:00.000Z_${NOBODY}`
  ]) {
    const result = await api.as(ada)(getTrashedFiles, { spaceId, cursor });
    assert.equal(!result.ok && result.code, 'INVALID_INPUT', `"${cursor}"`);
  }
});
