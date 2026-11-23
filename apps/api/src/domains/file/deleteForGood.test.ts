import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  deleteFile,
  emptyTrash,
  FILE_CONTENT_PATH,
  getFile,
  getFiles,
  getTrashedFiles,
  restoreFile,
  trashFile
} from '@pocketmice/contract/domains/file';
import { createInvite } from '@pocketmice/contract/domains/invite';
import { createSpace, deleteSpace, getSpaces } from '@pocketmice/contract/domains/space';
import { files, fileVersions } from '@pocketmice/db/schema/file';
import { spaceInvites } from '@pocketmice/db/schema/invite';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { eq, inArray } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { MissingObject } from '../../storage/fileStorage.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

interface Made {
  id: string;
  path: string;
  version: { id: string } | null;
}

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes a folder as this person and returns it */
async function makeFolder(person: CurrentUser, spaceId: string, parentId: string | null, name: string): Promise<Made> {
  const result = await api.as(person)(createFolder, { spaceId, parentId, name });
  assert.ok(result.ok, `createFolder should have worked: ${JSON.stringify(result)}`);
  return result.data.file;
}

/** Uploads content as this person: a new file under name, or over the file `over`. Returns the file */
async function write(
  person: CurrentUser,
  spaceId: string,
  where: { parentId: string | null; name: string } | Made,
  content: string
) {
  const query: Record<string, string> =
    'id' in where
      ? { spaceId, fileId: where.id, baseVersionId: where.version?.id ?? NOBODY }
      : { spaceId, name: where.name, ...(where.parentId && { parentId: where.parentId }) };
  const body = Buffer.from(content);
  const response = await api.send(person, `${FILE_CONTENT_PATH}?${new URLSearchParams(query)}`, {
    method: 'PUT',
    headers: { 'content-length': String(body.length) },
    body
  });
  const answer = (await response.json()) as { file: Made };
  assert.equal(response.status, 200, `the upload should have worked: ${JSON.stringify(answer)}`);
  return answer.file;
}

/** Puts a file in the trash as this person */
async function trash(person: CurrentUser, spaceId: string, fileId: string) {
  assert.deepEqual(await api.as(person)(trashFile, { spaceId, fileId }), { ok: true, data: {} });
}

/** The ids of the versions that still have a row, out of these */
async function versionRows(ids: string[]) {
  const rows = await api.db.select({ id: fileVersions.id }).from(fileVersions).where(inArray(fileVersions.id, ids));
  return rows.map((row) => row.id).sort();
}

/** Whether the storage still has the bytes of this version */
async function hasBytes(versionId: string) {
  try {
    (await api.storage.get(versionId)).destroy();
    return true;
  } catch (error) {
    if (error instanceof MissingObject) return false;
    throw error;
  }
}

/** How many objects the storage really holds */
async function storedObjects() {
  const entries = await readdir(api.storageDir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}

test('deleteFile deletes a trashed file for good: its row, every version of it, and their bytes', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await write(ada, spaceId, { parentId: null, name: 'notes.md' }, 'one');
  const second = await write(ada, spaceId, first, 'two');
  const kept = await write(ada, spaceId, { parentId: null, name: 'kept.md' }, 'kept');
  const versions = [first.version?.id ?? '', second.version?.id ?? ''];
  await trash(ada, spaceId, first.id);

  assert.deepEqual(await api.as(ada)(deleteFile, { spaceId, fileId: first.id }), { ok: true, data: {} });

  assert.deepEqual(await api.db.select().from(files).where(eq(files.id, first.id)), []);
  assert.deepEqual(await versionRows(versions), []);
  assert.deepEqual(await Promise.all(versions.map(hasBytes)), [false, false]);
  // Nothing brings it back, and it is no longer in the trash
  const restored = await api.as(ada)(restoreFile, { spaceId, fileId: first.id });
  assert.equal(!restored.ok && restored.code, 'NOT_FOUND');
  const trashed = await api.as(ada)(getTrashedFiles, { spaceId });
  assert.deepEqual(trashed.ok && trashed.data.files, []);
  // What was not deleted is as it was
  assert.equal(await hasBytes(kept.version?.id ?? ''), true);
  assert.equal((await api.as(ada)(getFile, { spaceId, fileId: kept.id })).ok, true);
});

test('deleteFile of a trashed folder deletes everything in it, however deep, also what was trashed on its own before', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const year = await makeFolder(ada, spaceId, reports.id, '2026');
  const deep = await write(ada, spaceId, { parentId: year.id, name: 'q1.md' }, 'deep');
  const direct = await write(ada, spaceId, { parentId: reports.id, name: 'index.md' }, 'direct');
  const earlier = await write(ada, spaceId, { parentId: reports.id, name: 'old.md' }, 'trashed before the folder');
  const outside = await write(ada, spaceId, { parentId: null, name: 'outside.md' }, 'outside');
  await trash(ada, spaceId, earlier.id);
  await trash(ada, spaceId, reports.id);
  const before = await storedObjects();

  assert.deepEqual(await api.as(ada)(deleteFile, { spaceId, fileId: reports.id }), { ok: true, data: {} });

  const left = await api.db.select({ name: files.name }).from(files).where(eq(files.spaceId, spaceId));
  assert.deepEqual(
    left.map((row) => row.name),
    ['outside.md']
  );
  assert.equal(await storedObjects(), before - 3);
  for (const gone of [deep, direct, earlier]) assert.equal(await hasBytes(gone.version?.id ?? ''), false);
  assert.equal(await hasBytes(outside.version?.id ?? ''), true);
});

test('deleteFile only deletes what was put in the trash itself: anything else is NOT_FOUND and stays', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const live = await write(ada, spaceId, { parentId: null, name: 'live.md' }, 'live');
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const inside = await write(ada, spaceId, { parentId: reports.id, name: 'inside.md' }, 'inside');
  await trash(ada, spaceId, reports.id);
  const elsewhere = await write(ada, otherSpaceId, { parentId: null, name: 'elsewhere.md' }, 'elsewhere');
  await trash(ada, otherSpaceId, elsewhere.id);
  const before = await storedObjects();

  for (const fileId of [live.id, inside.id, elsewhere.id, NOBODY]) {
    const result = await api.as(ada)(deleteFile, { spaceId, fileId });
    assert.equal(!result.ok && result.code, 'NOT_FOUND', fileId);
  }

  assert.equal(await storedObjects(), before);
  assert.equal((await api.as(ada)(getFile, { spaceId, fileId: live.id })).ok, true);
  assert.equal((await api.as(ada)(restoreFile, { spaceId, fileId: reports.id })).ok, true);
  assert.equal((await api.as(ada)(getFile, { spaceId, fileId: inside.id })).ok, true);
});

test('emptyTrash deletes for good everything in the trash of one space, and nothing else', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const live = await write(ada, spaceId, { parentId: null, name: 'live.md' }, 'live');
  const single = await write(ada, spaceId, { parentId: null, name: 'single.md' }, 'single');
  const folder = await makeFolder(ada, spaceId, null, 'Old');
  const inside = await write(ada, spaceId, { parentId: folder.id, name: 'inside.md' }, 'inside');
  const elsewhere = await write(ada, otherSpaceId, { parentId: null, name: 'elsewhere.md' }, 'elsewhere');
  for (const [inSpace, file] of [
    [spaceId, single],
    [spaceId, folder],
    [otherSpaceId, elsewhere]
  ] as const) {
    await trash(ada, inSpace, file.id);
  }

  assert.deepEqual(await api.as(ada)(emptyTrash, { spaceId }), { ok: true, data: {} });

  const listed = await api.as(ada)(getFiles, { spaceId, parentId: null });
  assert.deepEqual(listed.ok && listed.data.files.map((file) => file.name), ['live.md']);
  const trashed = await api.as(ada)(getTrashedFiles, { spaceId });
  assert.deepEqual(trashed.ok && trashed.data.files, []);
  assert.deepEqual(
    await Promise.all([single, inside, live, elsewhere].map((file) => hasBytes(file.version?.id ?? ''))),
    [false, false, true, true]
  );
  // The trash of the other space is as it was
  const other = await api.as(ada)(getTrashedFiles, { spaceId: otherSpaceId });
  assert.deepEqual(other.ok && other.data.files.map((file) => file.path), ['/elsewhere.md']);
  // Emptying a trash that is empty is nothing
  assert.deepEqual(await api.as(ada)(emptyTrash, { spaceId }), { ok: true, data: {} });
});

test('deleteSpace deletes the space for good: its files and their bytes, its members, its invites', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  const keptSpaceId = await makeSpace(ada, 'Kept');
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'editor' });
  assert.equal((await api.as(ada)(createInvite, { spaceId, role: 'viewer', storageLimit: null })).ok, true);
  const folder = await makeFolder(ada, spaceId, null, 'Reports');
  const first = await write(ada, spaceId, { parentId: folder.id, name: 'notes.md' }, 'one');
  const second = await write(grace, spaceId, first, 'two');
  const trashed = await write(ada, spaceId, { parentId: null, name: 'trashed.md' }, 'trashed');
  await trash(ada, spaceId, trashed.id);
  const kept = await write(ada, keptSpaceId, { parentId: null, name: 'kept.md' }, 'kept');

  assert.deepEqual(await api.as(ada)(deleteSpace, { spaceId }), { ok: true, data: {} });

  assert.deepEqual(await api.db.select().from(spaces).where(eq(spaces.id, spaceId)), []);
  assert.deepEqual(await api.db.select().from(files).where(eq(files.spaceId, spaceId)), []);
  assert.deepEqual(await api.db.select().from(spaceMembers).where(eq(spaceMembers.spaceId, spaceId)), []);
  assert.deepEqual(await api.db.select().from(spaceInvites).where(eq(spaceInvites.spaceId, spaceId)), []);
  assert.deepEqual(await Promise.all([first, second, trashed].map((file) => hasBytes(file.version?.id ?? ''))), [
    false,
    false,
    false
  ]);
  // It no longer exists for anyone who was in it
  for (const person of [ada, grace]) {
    const result = await api.as(person)(getFiles, { spaceId, parentId: null });
    assert.equal(!result.ok && result.code, 'UNKNOWN_SPACE');
  }
  // The other space of the same person is as it was
  const spacesLeft = await api.as(ada)(getSpaces, {});
  assert.deepEqual(spacesLeft.ok && spacesLeft.data.spaces.map((space) => space.name), ['Kept']);
  assert.equal(await hasBytes(kept.version?.id ?? ''), true);
});

test('deleteSpace deletes every file of the space, also ones that no path leads to any more', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const outer = await makeFolder(ada, spaceId, null, 'Outer');
  const inner = await makeFolder(ada, spaceId, null, 'Inner');
  const file = await write(ada, spaceId, { parentId: inner.id, name: 'notes.md' }, 'the content');
  // Two folders, each in the other: what two moves at the same moment can leave behind (see moveFile.ts). Nothing
  // finds them from the top of the space
  await api.db.update(files).set({ parentId: inner.id }).where(eq(files.id, outer.id));
  await api.db.update(files).set({ parentId: outer.id }).where(eq(files.id, inner.id));

  assert.deepEqual(await api.as(ada)(deleteSpace, { spaceId }), { ok: true, data: {} });

  assert.deepEqual(await api.db.select().from(files).where(eq(files.spaceId, spaceId)), []);
  assert.deepEqual(await api.db.select().from(spaces).where(eq(spaces.id, spaceId)), []);
  assert.equal(await hasBytes(file.version?.id ?? ''), false);
});

test('what cannot be undone is for the owner, signed in themselves: not an editor, and not a key, not even a key of the owner', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'editor' });
  const file = await write(ada, spaceId, { parentId: null, name: 'notes.md' }, 'the content');
  await trash(ada, spaceId, file.id);
  const made = await api.as(ada)(createApiKey, { name: 'Research agent', permission: 'write' });
  assert.ok(made.ok);

  for (const caller of [api.as(grace), api.withKey(made.data.apiKey.key), api.as(null)]) {
    const results = [
      await caller(deleteFile, { spaceId, fileId: file.id }),
      await caller(emptyTrash, { spaceId }),
      await caller(deleteSpace, { spaceId })
    ];
    assert.deepEqual(
      results.map((result) => result.ok),
      [false, false, false]
    );
  }
  // An editor is refused for the role, a key for being a key, and nobody for being nobody
  const byEditor = await api.as(grace)(emptyTrash, { spaceId });
  const byKey = await api.withKey(made.data.apiKey.key)(emptyTrash, { spaceId });
  const byNobody = await api.as(null)(emptyTrash, { spaceId });
  assert.deepEqual(
    [byEditor, byKey, byNobody].map((result) => !result.ok && result.code),
    ['FORBIDDEN', 'FORBIDDEN', 'UNAUTHENTICATED']
  );

  // Nothing went: the owner still restores it, content and all
  const restored = await api.as(ada)(restoreFile, { spaceId, fileId: file.id });
  assert.equal(restored.ok && restored.data.file.version?.id, file.version?.id);
  assert.equal(await hasBytes(file.version?.id ?? ''), true);
});

test('when the storage fails to remove the bytes, the delete still counts and the failure is reported', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const file = await write(ada, spaceId, { parentId: null, name: 'notes.md' }, 'the content');
  await trash(ada, spaceId, file.id);
  const original = api.storage.delete;
  api.storage.delete = async () => {
    throw new Error('the disk said no');
  };

  try {
    assert.deepEqual(await api.as(ada)(deleteFile, { spaceId, fileId: file.id }), { ok: true, data: {} });
  } finally {
    api.storage.delete = original;
  }

  // The rows are gone, which is what the caller asked for. The bytes are left, with nothing pointing at them
  assert.deepEqual(await api.db.select().from(files).where(eq(files.id, file.id)), []);
  assert.equal(await hasBytes(file.version?.id ?? ''), true);
  const reports = api.takeReported();
  assert.deepEqual(
    reports.map(({ error, where }) => [where, (error as Error).message]),
    [['removeContent', 'the disk said no']]
  );
});
