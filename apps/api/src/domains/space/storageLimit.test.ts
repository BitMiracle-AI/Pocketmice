import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  deleteFile,
  FILE_CONTENT_PATH,
  getFile,
  getFileByPath,
  restoreFileVersion,
  trashFile,
  updateFile
} from '@pocketmice/contract/domains/file';
import { createInvite, joinSpace } from '@pocketmice/contract/domains/invite';
import {
  createSpace,
  getMembers,
  getSpaceSize,
  removeMember,
  updateMemberStorageLimit,
  updateSpaceStorageLimit
} from '@pocketmice/contract/domains/space';
import { fileVersions } from '@pocketmice/db/schema/file';
import { spaceInvites } from '@pocketmice/db/schema/invite';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

// The storage limits of a space and of its members: what is counted, who sets a limit, and what a limit refuses.
// The rules are in the contract ("Storage limits" in domains/space.ts).

const api = useTestApi();

type Who = CurrentUser | { key: string };

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

/** Puts this person into the space in this role, by writing the row */
async function add(spaceId: string, person: CurrentUser, role: 'editor' | 'viewer') {
  await api.db.insert(spaceMembers).values({ spaceId, userId: person.id, role });
}

/** Makes an API key for this person and returns the key itself */
async function makeKey(person: CurrentUser, permission: 'read' | 'write') {
  const result = await api.as(person)(createApiKey, { name: 'Research agent', permission });
  assert.ok(result.ok, `createApiKey should have worked: ${JSON.stringify(result)}`);
  return result.data.apiKey.key;
}

/** Sends an upload of this many bytes: a new file under name, or a new version of the file over */
function put(who: Who, spaceId: string, target: { name: string } | { over: Uploaded }, bytes: number) {
  const query: Record<string, string> =
    'name' in target
      ? { spaceId, name: target.name }
      : { spaceId, fileId: target.over.id, baseVersionId: target.over.version.id };
  const body = Buffer.alloc(bytes, 'a');
  return api.send(who, `${FILE_CONTENT_PATH}?${new URLSearchParams(query)}`, {
    method: 'PUT',
    headers: { 'content-length': String(body.length) },
    body
  });
}

/** Uploads, which must work, and returns the file */
async function upload(who: Who, spaceId: string, target: { name: string } | { over: Uploaded }, bytes: number) {
  const response = await put(who, spaceId, target, bytes);
  const answer = (await response.json()) as { file: Uploaded };
  assert.equal(response.status, 200, `the upload should have worked: ${JSON.stringify(answer)}`);
  return answer.file;
}

/** The status and the error code of an upload that was refused */
async function refused(response: Response) {
  const body = (await response.json()) as { error?: { code: string } };
  return [response.status, body.error?.code];
}

/** What the space holds and may hold, as this person is told */
async function sizeOf(spaceId: string, asPerson: CurrentUser) {
  const result = await api.as(asPerson)(getSpaceSize, { spaceId });
  return result.ok ? result.data : result.code;
}

/** Sets the limit of the space as its owner, which must work */
async function limitSpace(owner: CurrentUser, spaceId: string, storageLimit: number | null) {
  const result = await api.as(owner)(updateSpaceStorageLimit, { spaceId, storageLimit });
  assert.ok(result.ok, `updateSpaceStorageLimit should have worked: ${JSON.stringify(result)}`);
  return result.data;
}

/** Sets the limit of a member as the owner of the space, which must work */
async function limitMember(owner: CurrentUser, spaceId: string, member: CurrentUser, storageLimit: number | null) {
  const result = await api.as(owner)(updateMemberStorageLimit, { spaceId, userId: member.id, storageLimit });
  assert.ok(result.ok, `updateMemberStorageLimit should have worked: ${JSON.stringify(result)}`);
  return result.data.member;
}

/** What each member holds and may hold, by name: [storageSize, storageLimit] */
async function held(spaceId: string, asPerson: CurrentUser) {
  const result = await api.as(asPerson)(getMembers, { spaceId });
  assert.ok(result.ok, `getMembers should have worked: ${JSON.stringify(result)}`);
  return Object.fromEntries(
    result.data.members.map((member) => [member.name, [member.storageSize, member.storageLimit]])
  );
}

/** How many objects the storage really holds */
async function storedObjects() {
  const entries = await readdir(api.storageDir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}

test('what a space holds is every version of every file in it, the versions before the current one and the trash included; any member may ask, and any key', async () => {
  const ada = await api.addPerson('Ada');
  const linus = await api.addPerson('Linus');
  const stranger = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  const other = await makeSpace(ada, 'Reports');
  await add(spaceId, linus, 'viewer');
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 0, storageLimit: null });

  const notes = await upload(ada, spaceId, { name: 'notes.md' }, 100);
  await upload(ada, spaceId, { over: notes }, 40);
  const draft = await upload(ada, spaceId, { name: 'draft.md' }, 10);
  await upload(ada, other, { name: 'elsewhere.md' }, 7);
  // A folder holds nothing, and an empty file is a version of no bytes
  assert.equal((await api.as(ada)(createFolder, { spaceId, parentId: null, name: 'Reports' })).ok, true);
  await upload(ada, spaceId, { name: 'empty.md' }, 0);
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 150, storageLimit: null });

  // The trash keeps what is put in it
  assert.equal((await api.as(ada)(trashFile, { spaceId, fileId: draft.id })).ok, true);

  const expected = { storageSize: 150, storageLimit: null };
  assert.deepEqual(await sizeOf(spaceId, ada), expected);
  assert.deepEqual(await sizeOf(spaceId, linus), expected);
  assert.deepEqual(await api.withKey(await makeKey(linus, 'read'))(getSpaceSize, { spaceId }), {
    ok: true,
    data: expected
  });
  assert.deepEqual(await sizeOf(other, ada), { storageSize: 7, storageLimit: null });
  assert.equal(await sizeOf(spaceId, stranger), 'UNKNOWN_SPACE');
});

test('the owner sets the storage limit of the space and takes it away, signed in themselves: no other member does, and no key', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const stranger = await api.addPerson('Linus');
  const spaceId = await makeSpace(ada);
  await add(spaceId, grace, 'editor');
  await upload(ada, spaceId, { name: 'notes.md' }, 30);

  assert.deepEqual(await api.as(ada)(updateSpaceStorageLimit, { spaceId, storageLimit: 1000 }), {
    ok: true,
    data: { storageSize: 30, storageLimit: 1000 }
  });
  assert.deepEqual(await sizeOf(spaceId, grace), { storageSize: 30, storageLimit: 1000 });

  const refusals = [
    [await api.as(grace)(updateSpaceStorageLimit, { spaceId, storageLimit: 5 }), 'FORBIDDEN'],
    [await api.as(stranger)(updateSpaceStorageLimit, { spaceId, storageLimit: 5 }), 'UNKNOWN_SPACE'],
    [await api.as(null)(updateSpaceStorageLimit, { spaceId, storageLimit: 5 }), 'UNAUTHENTICATED'],
    // A limit holds agents too: one that could change it would not be held by it
    [
      await api.withKey(await makeKey(ada, 'write'))(updateSpaceStorageLimit, { spaceId, storageLimit: 5 }),
      'FORBIDDEN'
    ],
    [await api.withKey(await makeKey(ada, 'read'))(updateSpaceStorageLimit, { spaceId, storageLimit: 5 }), 'FORBIDDEN'],
    [
      await api.withKey(await makeKey(ada, 'write'))(updateSpaceStorageLimit, { spaceId, storageLimit: null }),
      'FORBIDDEN'
    ]
  ] as const;
  assert.deepEqual(
    refusals.map(([result]) => !result.ok && result.code),
    refusals.map(([, code]) => code)
  );
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 30, storageLimit: 1000 });

  assert.deepEqual(await limitSpace(ada, spaceId, null), { storageSize: 30, storageLimit: null });
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 30, storageLimit: null });
});

test('a storage limit is a whole number of bytes that is not below zero, or null: anything else is INVALID_INPUT, and the limit stays', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  await limitSpace(ada, spaceId, 1000);
  await limitMember(ada, spaceId, ada, 500);

  for (const storageLimit of [-1, 1.5, '100', 2 ** 53, undefined]) {
    // @ts-expect-error -- a limit that is not one
    const ofSpace = await api.as(ada)(updateSpaceStorageLimit, { spaceId, storageLimit });
    // @ts-expect-error -- a limit that is not one
    const ofMember = await api.as(ada)(updateMemberStorageLimit, { spaceId, userId: ada.id, storageLimit });
    // @ts-expect-error -- a limit that is not one
    const ofInvite = await api.as(ada)(createInvite, { spaceId, role: 'editor', storageLimit });
    assert.deepEqual(
      [ofSpace, ofMember, ofInvite].map((result) => !result.ok && result.code),
      ['INVALID_INPUT', 'INVALID_INPUT', 'INVALID_INPUT'],
      String(storageLimit)
    );
  }

  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 0, storageLimit: 1000 });
  assert.deepEqual(await held(spaceId, ada), { Ada: [0, 500] });
  // Zero is a limit, and the largest number that is still exact is one
  assert.deepEqual(await limitSpace(ada, spaceId, 0), { storageSize: 0, storageLimit: 0 });
  assert.deepEqual(await limitSpace(ada, spaceId, Number.MAX_SAFE_INTEGER), {
    storageSize: 0,
    storageLimit: Number.MAX_SAFE_INTEGER
  });
});

test('an upload that would take the space past its limit is refused before its bytes are taken; one that fills it exactly is taken', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  await limitSpace(ada, spaceId, 100);
  const notes = await upload(ada, spaceId, { name: 'notes.md' }, 60);
  const before = await storedObjects();

  assert.deepEqual(await refused(await put(ada, spaceId, { name: 'more.md' }, 41)), [
    413,
    'SPACE_STORAGE_LIMIT_EXCEEDED'
  ]);
  // The version written over stays, so a new version adds all of its bytes: one byte over 60 is not 1 in place of 60
  assert.deepEqual(await refused(await put(ada, spaceId, { over: notes }, 41)), [413, 'SPACE_STORAGE_LIMIT_EXCEEDED']);

  assert.equal(await storedObjects(), before);
  const made = await api.as(ada)(getFileByPath, { spaceId, path: '/more.md' });
  assert.equal(!made.ok && made.code, 'NOT_FOUND');
  const current = await api.as(ada)(getFile, { spaceId, fileId: notes.id });
  assert.equal(current.ok && current.data.file.version?.id, notes.version.id);

  await upload(ada, spaceId, { name: 'more.md' }, 40);
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 100, storageLimit: 100 });
  assert.deepEqual(await refused(await put(ada, spaceId, { name: 'one.md' }, 1)), [
    413,
    'SPACE_STORAGE_LIMIT_EXCEEDED'
  ]);
  // Content of no bytes adds nothing
  await upload(ada, spaceId, { name: 'empty.md' }, 0);
});

test('what a member holds is what they wrote, also through their keys: a write that would take them past their own limit is refused, and holds nobody else', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await makeSpace(ada);
  await add(spaceId, grace, 'editor');
  await add(spaceId, linus, 'editor');
  const agent = { key: await makeKey(grace, 'write') };

  assert.deepEqual(await limitMember(ada, spaceId, grace, 50), {
    userId: grace.id,
    name: 'Grace',
    role: 'editor',
    storageSize: 0,
    storageLimit: 50
  });

  // Somebody else has written more than she may hold: it is not hers, and does not count against her
  await upload(linus, spaceId, { name: 'early.md' }, 100);
  const hers = await upload(agent, spaceId, { name: 'by-the-agent.md' }, 30);
  const before = await storedObjects();
  assert.deepEqual(await refused(await put(grace, spaceId, { name: 'more.md' }, 21)), [
    413,
    'MEMBER_STORAGE_LIMIT_EXCEEDED'
  ]);
  assert.deepEqual(await refused(await put(agent, spaceId, { name: 'more.md' }, 21)), [
    413,
    'MEMBER_STORAGE_LIMIT_EXCEEDED'
  ]);
  assert.equal(await storedObjects(), before);
  await upload(grace, spaceId, { name: 'more.md' }, 20);

  // Somebody else is not held by her limit, and what they write is theirs
  const his = await upload(linus, spaceId, { name: 'large.md' }, 500);
  // Writing over his file would be hers: one byte more than she may hold
  assert.deepEqual(await refused(await put(grace, spaceId, { over: his }, 1)), [413, 'MEMBER_STORAGE_LIMIT_EXCEEDED']);
  // He writes over hers: the version she wrote stays, and stays hers
  await upload(linus, spaceId, { over: hers }, 5);

  const expected = { Ada: [0, null], Grace: [50, 50], Linus: [605, null] };
  assert.deepEqual(await held(spaceId, ada), expected);
  // Every member is told, not the owner alone
  assert.deepEqual(await held(spaceId, grace), expected);
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 655, storageLimit: null });

  // Without the limit she writes again
  await limitMember(ada, spaceId, grace, null);
  await upload(grace, spaceId, { name: 'again.md' }, 21);
});

test('the owner sets the limit of a member, their own too, signed in themselves: no other member does, and no key; a member the space does not have is NOT_FOUND', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const stranger = await api.addPerson('Linus');
  const spaceId = await makeSpace(ada);
  const other = await makeSpace(stranger, 'Reports');
  await add(spaceId, grace, 'editor');

  // The owner is a member like any other here: a limit of their own holds the agents that write with their keys
  assert.equal((await limitMember(ada, spaceId, ada, 10)).storageLimit, 10);
  assert.deepEqual(await refused(await put({ key: await makeKey(ada, 'write') }, spaceId, { name: 'a.md' }, 11)), [
    413,
    'MEMBER_STORAGE_LIMIT_EXCEEDED'
  ]);

  const input = { spaceId, userId: grace.id, storageLimit: 5 };
  const refusals = [
    [await api.as(grace)(updateMemberStorageLimit, input), 'FORBIDDEN'],
    [await api.as(stranger)(updateMemberStorageLimit, input), 'UNKNOWN_SPACE'],
    [await api.withKey(await makeKey(ada, 'write'))(updateMemberStorageLimit, input), 'FORBIDDEN'],
    // Raising their own is what an agent held by a limit would do
    [
      await api.withKey(await makeKey(ada, 'write'))(updateMemberStorageLimit, {
        spaceId,
        userId: ada.id,
        storageLimit: null
      }),
      'FORBIDDEN'
    ],
    [await api.as(ada)(updateMemberStorageLimit, { ...input, userId: stranger.id }), 'NOT_FOUND'],
    [await api.as(ada)(updateMemberStorageLimit, { ...input, userId: NOBODY }), 'NOT_FOUND']
  ] as const;
  assert.deepEqual(
    refusals.map(([result]) => !result.ok && result.code),
    refusals.map(([, code]) => code)
  );

  assert.deepEqual(await held(spaceId, ada), { Ada: [0, 10], Grace: [0, null] });
  // The member of another space was not given a limit there
  assert.deepEqual(await held(other, stranger), { Linus: [0, null] });
});

test('when both limits would be passed it is the space that is told: raising the member would not help', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await add(spaceId, grace, 'editor');
  await limitSpace(ada, spaceId, 100);
  await limitMember(ada, spaceId, grace, 10);

  assert.deepEqual(await refused(await put(grace, spaceId, { name: 'a.md' }, 11)), [
    413,
    'MEMBER_STORAGE_LIMIT_EXCEEDED'
  ]);
  assert.deepEqual(await refused(await put(grace, spaceId, { name: 'a.md' }, 101)), [
    413,
    'SPACE_STORAGE_LIMIT_EXCEEDED'
  ]);
  // The message is for whoever reads the log, or for a model: it says how much is held, the limit and what was asked
  const told = (await (await put(grace, spaceId, { name: 'a.md' }, 11)).json()) as { error: { message: string } };
  assert.match(told.error.message, /^You hold 0 bytes in space .+ and may hold 10: 11 more do not fit\./);
});

test('restoreFileVersion adds a version as large as the old one: refused when the space or the caller may not hold it, and nothing is copied', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await add(spaceId, grace, 'editor');
  const first = await upload(ada, spaceId, { name: 'notes.md' }, 60);
  const second = await upload(ada, spaceId, { over: first }, 10);
  const input = { spaceId, fileId: first.id, versionId: first.version.id, baseVersionId: second.version.id };
  const before = await storedObjects();

  await limitSpace(ada, spaceId, 129);
  const overSpace = await api.as(ada)(restoreFileVersion, input);
  assert.equal(!overSpace.ok && overSpace.code, 'SPACE_STORAGE_LIMIT_EXCEEDED');

  await limitSpace(ada, spaceId, null);
  await limitMember(ada, spaceId, grace, 59);
  const overMember = await api.as(grace)(restoreFileVersion, input);
  assert.equal(!overMember.ok && overMember.code, 'MEMBER_STORAGE_LIMIT_EXCEEDED');

  assert.equal(await storedObjects(), before);
  const current = await api.as(ada)(getFile, { spaceId, fileId: first.id });
  assert.equal(current.ok && current.data.file.version?.id, second.version.id);

  // With room for it, the copy is hers: she restored it
  await limitMember(ada, spaceId, grace, 60);
  const restored = await api.as(grace)(restoreFileVersion, input);
  assert.equal(restored.ok && restored.data.file.version?.size, 60);
  assert.deepEqual(await held(spaceId, ada), { Ada: [70, null], Grace: [60, 60] });
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 130, storageLimit: null });
});

test('a limit under what is held is taken as it is, and only adding bytes is refused: the space is still read and tidied, and deleting for good makes room', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const notes = await upload(ada, spaceId, { name: 'notes.md' }, 100);

  assert.deepEqual(await limitSpace(ada, spaceId, 50), { storageSize: 100, storageLimit: 50 });
  assert.deepEqual(await refused(await put(ada, spaceId, { name: 'more.md' }, 1)), [
    413,
    'SPACE_STORAGE_LIMIT_EXCEEDED'
  ]);

  const folder = await api.as(ada)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  const renamed = await api.as(ada)(updateFile, { spaceId, fileId: notes.id, name: 'renamed.md' });
  const read = await api.send(ada, `${FILE_CONTENT_PATH}?${new URLSearchParams({ spaceId, fileId: notes.id })}`);
  const trashed = await api.as(ada)(trashFile, { spaceId, fileId: notes.id });
  assert.deepEqual([folder.ok, renamed.ok, read.status, trashed.ok], [true, true, 200, true]);

  // Content of no bytes adds nothing, also to a space that holds more than it may
  await upload(ada, spaceId, { name: 'empty.md' }, 0);

  // The trash keeps it, so there is no more room than before
  assert.deepEqual(await refused(await put(ada, spaceId, { name: 'more.md' }, 1)), [
    413,
    'SPACE_STORAGE_LIMIT_EXCEEDED'
  ]);

  assert.equal((await api.as(ada)(deleteFile, { spaceId, fileId: notes.id })).ok, true);
  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 0, storageLimit: 50 });
  await upload(ada, spaceId, { name: 'more.md' }, 50);
});

test('what someone wrote stays counted in the space when they are taken out of it, and is theirs again when they come back', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await add(spaceId, grace, 'editor');
  await upload(grace, spaceId, { name: 'hers.md' }, 30);

  assert.equal((await api.as(ada)(removeMember, { spaceId, userId: grace.id })).ok, true);

  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 30, storageLimit: null });
  assert.deepEqual(await held(spaceId, ada), { Ada: [0, null] });

  // She comes back with an invite that gives a limit: what she wrote before counts towards it
  const invited = await api.as(ada)(createInvite, { spaceId, role: 'editor', storageLimit: 40 });
  assert.ok(invited.ok);
  assert.equal((await api.as(grace)(joinSpace, { inviteId: invited.data.invite.id })).ok, true);

  assert.deepEqual(await held(spaceId, ada), { Ada: [0, null], Grace: [30, 40] });
  assert.deepEqual(await refused(await put(grace, spaceId, { name: 'more.md' }, 11)), [
    413,
    'MEMBER_STORAGE_LIMIT_EXCEEDED'
  ]);
  await upload(grace, spaceId, { name: 'more.md' }, 10);
});

test('the database refuses a limit below zero, and a version that names another space than the one its file is in', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const other = await makeSpace(ada, 'Reports');
  const notes = await upload(ada, spaceId, { name: 'notes.md' }, 10);

  await assert.rejects(api.db.update(spaces).set({ storageLimit: -1 }).where(eq(spaces.id, spaceId)));
  await assert.rejects(api.db.update(spaceMembers).set({ storageLimit: -1 }).where(eq(spaceMembers.spaceId, spaceId)));
  await assert.rejects(
    api.db.insert(spaceInvites).values({
      spaceId,
      role: 'editor',
      storageLimit: -1,
      userId: ada.id,
      expiresAt: new Date(Date.now() + 60_000)
    })
  );
  // Counted in a space it is not in, a version would take up room there and none where it is
  await assert.rejects(
    api.db.insert(fileVersions).values({
      id: NOBODY,
      fileId: notes.id,
      spaceId: other,
      size: 5,
      sha256: 'x',
      userId: ada.id
    })
  );
  await assert.rejects(api.db.update(fileVersions).set({ spaceId: other }).where(eq(fileVersions.fileId, notes.id)));

  assert.deepEqual(await sizeOf(spaceId, ada), { storageSize: 10, storageLimit: null });
  assert.deepEqual(await sizeOf(other, ada), { storageSize: 0, storageLimit: null });
});
