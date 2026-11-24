import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  fileContentPath,
  getFile,
  getFileSize,
  getFiles,
  moveFile,
  restoreFile,
  trashFile
} from '@pocketmice/contract/domains/file';
import { createSpace, getSpaceSize } from '@pocketmice/contract/domains/space';
import { spaceMembers } from '@pocketmice/db/schema/space';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

// How much a file or a folder holds (getFileSize): what is counted, what is not, and who may ask.

const api = useTestApi();

/** A file as an upload answers with it */
interface Uploaded {
  id: string;
  version: { id: string; size: number };
}

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes a folder as this person, in the folder parentId or directly in the space, and returns its id */
async function makeFolder(person: CurrentUser, spaceId: string, parentId: string | null, name: string) {
  const result = await api.as(person)(createFolder, { spaceId, parentId, name });
  assert.ok(result.ok, `createFolder "${name}" should have worked: ${JSON.stringify(result)}`);
  return result.data.file.id;
}

/**
 * Uploads this many bytes as this person and returns the file: a new file called name in the folder parentId (null:
 * directly in the space), or a new version of the file over.
 */
async function upload(
  person: CurrentUser,
  spaceId: string,
  target: { parentId: string | null; name: string } | { over: Uploaded },
  bytes: number
) {
  const path = fileContentPath(
    'over' in target
      ? { spaceId, fileId: target.over.id, baseVersionId: target.over.version.id }
      : { spaceId, parentId: target.parentId, name: target.name }
  );
  const body = Buffer.alloc(bytes, 'a');
  const response = await api.send(person, path, {
    method: 'PUT',
    headers: { 'content-length': String(body.length) },
    body
  });
  const answer = (await response.json()) as { file: Uploaded };
  assert.equal(response.status, 200, `the upload should have worked: ${JSON.stringify(answer)}`);
  return answer.file;
}

/** How much this file or folder holds, as this person is told: the bytes, or the error code */
async function held(person: CurrentUser, spaceId: string, fileId: string) {
  const result = await api.as(person)(getFileSize, { spaceId, fileId });
  return result.ok ? result.data.storageSize : result.code;
}

/** Puts a file in the trash as this person */
async function trash(person: CurrentUser, spaceId: string, fileId: string) {
  assert.deepEqual(await api.as(person)(trashFile, { spaceId, fileId }), { ok: true, data: {} });
}

test('a folder holds every version of every file in it and in the folders inside it; a file holds every version of itself', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports, '2026');
  const quarter = await makeFolder(ada, spaceId, year, 'Q1');
  const other = await makeFolder(ada, spaceId, null, 'Other');
  const empty = await makeFolder(ada, spaceId, reports, 'Empty');

  const notes = await upload(ada, spaceId, { parentId: reports, name: 'notes.md' }, 100);
  const rewritten = await upload(ada, spaceId, { over: notes }, 40);
  const summary = await upload(ada, spaceId, { parentId: quarter, name: 'summary.md' }, 10);
  const blank = await upload(ada, spaceId, { parentId: year, name: 'blank.md' }, 0);
  await upload(ada, spaceId, { parentId: other, name: 'elsewhere.md' }, 7);
  const top = await upload(ada, spaceId, { parentId: null, name: 'top.md' }, 3);

  // The version that was written over is kept, and counts: the file holds more than its content now is
  assert.equal(rewritten.version.size, 40);
  assert.equal(await held(ada, spaceId, notes.id), 140);
  assert.equal(await held(ada, spaceId, summary.id), 10);
  assert.equal(await held(ada, spaceId, blank.id), 0);
  assert.equal(await held(ada, spaceId, top.id), 3);

  // What is three folders down counts in each folder above it, and what is next to a folder does not
  assert.equal(await held(ada, spaceId, quarter), 10);
  assert.equal(await held(ada, spaceId, year), 10);
  assert.equal(await held(ada, spaceId, reports), 150);
  assert.equal(await held(ada, spaceId, other), 7);
  assert.equal(await held(ada, spaceId, empty), 0);

  // A file counts where it is now, with every version it has
  const moved = await api.as(ada)(moveFile, { spaceId, fileId: notes.id, parentId: other });
  assert.ok(moved.ok, `moveFile should have worked: ${JSON.stringify(moved)}`);
  assert.equal(await held(ada, spaceId, reports), 10);
  assert.equal(await held(ada, spaceId, other), 147);
});

test('what is in the trash is not counted, in a folder or by itself, and is counted again once it is restored', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const old = await makeFolder(ada, spaceId, reports, 'Old');
  await upload(ada, spaceId, { parentId: reports, name: 'notes.md' }, 100);
  const archived = await upload(ada, spaceId, { parentId: old, name: 'archived.md' }, 20);
  const draft = await upload(ada, spaceId, { parentId: reports, name: 'draft.md' }, 5);
  await upload(ada, spaceId, { parentId: null, name: 'top.md' }, 3);
  assert.equal(await held(ada, spaceId, reports), 125);

  // A trashed file, and a trashed folder with what is in it
  await trash(ada, spaceId, draft.id);
  assert.equal(await held(ada, spaceId, reports), 120);
  await trash(ada, spaceId, old);
  assert.equal(await held(ada, spaceId, reports), 100);

  // Asked for by itself, what is in the trash is not there: the file, the folder, and what is in the folder
  assert.equal(await held(ada, spaceId, draft.id), 'NOT_FOUND');
  assert.equal(await held(ada, spaceId, old), 'NOT_FOUND');
  assert.equal(await held(ada, spaceId, archived.id), 'NOT_FOUND');

  // The space still keeps all of it: what is directly in the space holds that, less the trash
  const space = await api.as(ada)(getSpaceSize, { spaceId });
  assert.deepEqual(space, { ok: true, data: { storageSize: 128, storageLimit: null } });
  const atTop = await api.as(ada)(getFiles, { spaceId, parentId: null });
  assert.ok(atTop.ok, `getFiles should have worked: ${JSON.stringify(atTop)}`);
  const sizes = await Promise.all(atTop.data.files.map((file) => held(ada, spaceId, file.id)));
  assert.deepEqual(sizes, [100, 3]);

  // Restored, the folder counts again with what is in it; the file trashed on its own is still in the trash
  assert.equal((await api.as(ada)(restoreFile, { spaceId, fileId: old })).ok, true);
  assert.equal(await held(ada, spaceId, reports), 120);
  assert.equal(await held(ada, spaceId, old), 20);
  assert.equal(await held(ada, spaceId, archived.id), 20);
});

test('any member may ask how much a file holds, and any key; what is not a file of the space is NOT_FOUND', async () => {
  const ada = await api.addPerson('Ada');
  const linus = await api.addPerson('Linus');
  const stranger = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  const elsewhere = await makeSpace(ada, 'Reports');
  await api.db.insert(spaceMembers).values({ spaceId, userId: linus.id, role: 'viewer' });
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  await upload(ada, spaceId, { parentId: reports, name: 'notes.md' }, 30);
  const foreign = await upload(ada, elsewhere, { parentId: null, name: 'elsewhere.md' }, 7);

  assert.equal(await held(linus, spaceId, reports), 30);
  const key = await api.as(linus)(createApiKey, { name: 'Research agent', permission: 'read' });
  assert.ok(key.ok, `createApiKey should have worked: ${JSON.stringify(key)}`);
  assert.deepEqual(await api.withKey(key.data.apiKey.key)(getFileSize, { spaceId, fileId: reports }), {
    ok: true,
    data: { storageSize: 30 }
  });

  assert.equal(await held(stranger, spaceId, reports), 'UNKNOWN_SPACE');
  const signedOut = await api.as(null)(getFileSize, { spaceId, fileId: reports });
  assert.equal(!signedOut.ok && signedOut.code, 'UNAUTHENTICATED');
  assert.equal(await held(ada, spaceId, NOBODY), 'NOT_FOUND');
  // A file of another space the caller is in: it is there, and it is not a file of this one
  assert.equal((await api.as(ada)(getFile, { spaceId: elsewhere, fileId: foreign.id })).ok, true);
  assert.equal(await held(ada, spaceId, foreign.id), 'NOT_FOUND');
});
