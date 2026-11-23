import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';
import { test } from 'node:test';
import { createApiKey, deleteApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  FILE_CONTENT_PATH,
  getFile,
  getFileByPath,
  getFiles,
  getFileVersions,
  MAX_FILE_BYTES,
  restoreFileVersion,
  trashFile,
  updateFile
} from '@pocketmice/contract/domains/file';
import { createSpace } from '@pocketmice/contract/domains/space';
import { files, fileVersions } from '@pocketmice/db/schema/file';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import { ApiError, type CurrentUser } from '../../http/operation.ts';
import type { FileStorage } from '../../storage/fileStorage.ts';
import { NOBODY, useTestApi } from '../testing.ts';
import { rangeOf } from './fileContent.ts';
import { addVersionRow, createFileRow, storeContent } from './writeContent.ts';

const api = useTestApi();

type Who = CurrentUser | { key: string } | null;

/** What an upload or an operation answers with for a file that has content */
interface Uploaded {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  path: string;
  version: {
    id: string;
    size: number;
    sha256: string;
    user: { id: string; name: string };
    apiKey: { id: string; name: string } | null;
  };
}

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes a folder as this person and returns its id */
async function makeFolder(person: CurrentUser, spaceId: string, parentId: string | null, name: string) {
  const result = await api.as(person)(createFolder, { spaceId, parentId, name });
  assert.ok(result.ok, `createFolder should have worked: ${JSON.stringify(result)}`);
  return result.data.file.id;
}

/** Makes an API key for this person and returns it, with the key itself */
async function makeKey(person: CurrentUser, permission: 'read' | 'write', name = 'Research agent') {
  const result = await api.as(person)(createApiKey, { name, permission });
  assert.ok(result.ok, `createApiKey should have worked: ${JSON.stringify(result)}`);
  return result.data.apiKey;
}

/** Sends an upload. The query says what it is; content is the body */
function put(who: Who, query: Record<string, string>, content: Buffer | string, headers: Record<string, string> = {}) {
  const body = Buffer.from(content);
  return api.send(who, `${FILE_CONTENT_PATH}?${new URLSearchParams(query)}`, {
    method: 'PUT',
    headers: { 'content-length': String(body.length), ...headers },
    body
  });
}

/** Uploads a new file, which must work, and returns it */
async function upload(who: Who, query: Record<string, string>, content: Buffer | string): Promise<Uploaded> {
  const response = await put(who, query, content);
  const answer = (await response.json()) as { file: Uploaded };
  assert.equal(response.status, 200, `the upload should have worked: ${JSON.stringify(answer)}`);
  return answer.file;
}

/** Sends a download */
function get(who: Who, query: Record<string, string>, headers: Record<string, string> = {}) {
  return api.send(who, `${FILE_CONTENT_PATH}?${new URLSearchParams(query)}`, { headers });
}

/** The error code and the status of a failed response */
async function failure(response: Response) {
  const body = (await response.json()) as { error?: { code: string } };
  return [response.status, body.error?.code];
}

/** How many objects the storage really holds */
async function storedObjects() {
  const entries = await readdir(api.storageDir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).length;
}

test('an upload makes a file with its content as the first version, and a download gives the same bytes back', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const content = randomBytes(300_000);

  const file = await upload(ada, { spaceId, parentId: reports, name: ' summary.bin ' }, content);

  assert.deepEqual(
    [file.parentId, file.name, file.kind, file.path, file.version.size, file.version.sha256],
    [reports, 'summary.bin', 'file', '/Reports/summary.bin', content.length, sha256(content)]
  );
  // Who wrote it: the person themselves, so through no key
  assert.deepEqual([file.version.user, file.version.apiKey], [{ id: ada.id, name: 'Ada' }, null]);
  // The operations answer with the same file
  assert.deepEqual(await api.as(ada)(getFile, { spaceId, fileId: file.id }), { ok: true, data: { file } });
  assert.deepEqual(await api.as(ada)(getFileByPath, { spaceId, path: '/Reports/summary.bin' }), {
    ok: true,
    data: { file }
  });
  const listed = await api.as(ada)(getFiles, { spaceId, parentId: reports });
  assert.deepEqual(listed.ok && listed.data.files, [file]);

  const response = await get(ada, { spaceId, fileId: file.id });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
  // The bytes are in the storage under the id of the version, as they were sent
  assert.deepEqual(await buffer(await api.storage.get(file.version.id)), content);
});

test('an upload without parentId goes directly into the space, and a file of no bytes is a file', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);

  const file = await upload(ada, { spaceId, name: 'empty.txt' }, '');

  assert.deepEqual([file.parentId, file.path, file.version.size], [null, '/empty.txt', 0]);
  assert.equal(file.version.sha256, sha256(Buffer.alloc(0)));
  const response = await get(ada, { spaceId, fileId: file.id });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '0');
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});

test('a download is always a file to save, under its name, and says which version it is', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  // Content that a browser would run if it were shown as a page
  const page = '<script>alert(1)</script>';
  const file = await upload(ada, { spaceId, name: '报告 final.html' }, page);

  const response = await get(ada, { spaceId, fileId: file.id });

  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(
    response.headers.get('content-disposition'),
    `attachment; filename*=UTF-8''${encodeURIComponent('报告 final.html')}`
  );
  assert.equal(response.headers.get('etag'), `"${file.version.id}"`);
  assert.equal(response.headers.get('content-length'), String(Buffer.byteLength(page)));
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(await response.text(), page);
});

test("a download keeps its name when the name has a ' or ( ) * in it", async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const file = await upload(ada, { spaceId, name: "it's done (1) *.md" }, 'x');

  const response = await get(ada, { spaceId, fileId: file.id });

  // Each of the four written out. A browser that meets a ' as it is gives up on the name: Chrome saves the file as
  // "content"
  assert.equal(
    response.headers.get('content-disposition'),
    "attachment; filename*=UTF-8''it%27s%20done%20%281%29%20%2A.md"
  );
});

// Regression: the app hands a HEAD to the function that answers a GET, and drops the body of what it returns. The
// download fetched the bytes all the same, and the stream nobody read stayed open: with the folder storage, Node
// ended the whole process when it came across the file left open
test('a HEAD of the content is answered as a GET would be, without the bytes, and does not fetch them', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const file = await upload(ada, { spaceId, name: 'report.md' }, 'twelve bytes');
  const address = `${FILE_CONTENT_PATH}?${new URLSearchParams({ spaceId, fileId: file.id })}`;
  // The storage the api was built on, with its get counted for the length of this test
  const { storage } = api;
  const { get: fetch } = storage;
  let fetched = 0;
  storage.get = (...asked) => {
    fetched += 1;
    return fetch(...asked);
  };

  try {
    const whole = await api.send(ada, address, { method: 'HEAD' });
    const part = await api.send(ada, address, { method: 'HEAD', headers: { range: 'bytes=0-5' } });

    assert.deepEqual(
      [whole.status, whole.headers.get('content-length'), whole.headers.get('etag'), await whole.text()],
      [200, '12', `"${file.version.id}"`, '']
    );
    assert.deepEqual(
      [part.status, part.headers.get('content-length'), part.headers.get('content-range'), await part.text()],
      [206, '6', 'bytes 0-5/12', '']
    );
    assert.equal(fetched, 0);
    assert.equal(await (await get(ada, { spaceId, fileId: file.id })).text(), 'twelve bytes');
    assert.equal(fetched, 1);
  } finally {
    storage.get = fetch;
  }
});

test('writing over a file adds a version in place of the one named; the versions before it stay and can be downloaded', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'one');

  const response = await put(ada, { spaceId, fileId: first.id, baseVersionId: first.version.id }, 'two, longer');
  const second = ((await response.json()) as { file: Uploaded }).file;

  assert.equal(response.status, 200);
  assert.equal(second.id, first.id);
  assert.notEqual(second.version.id, first.version.id);
  assert.deepEqual([second.version.size, second.version.sha256], [11, sha256(Buffer.from('two, longer'))]);
  assert.equal(await (await get(ada, { spaceId, fileId: first.id })).text(), 'two, longer');
  // The version before it is still there, by its id
  const old = await get(ada, { spaceId, fileId: first.id, versionId: first.version.id });
  assert.equal(old.headers.get('etag'), `"${first.version.id}"`);
  assert.equal(await old.text(), 'one');
  const versions = await api.as(ada)(getFileVersions, { spaceId, fileId: first.id });
  assert.deepEqual(versions.ok && versions.data.versions.map((version) => version.id), [
    second.version.id,
    first.version.id
  ]);
});

test('writing over a version that is no longer the current one is CONFLICT: nobody writes over what they have not seen', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'editor' });
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'the original');
  const base = { spaceId, fileId: first.id, baseVersionId: first.version.id };
  // Both read the same version. Grace writes first
  assert.equal((await put(grace, base, 'what Grace wrote')).status, 200);
  const stored = await storedObjects();

  const late = await put(ada, base, 'what Ada wrote, not having seen Grace write');

  assert.deepEqual(await failure(late), [409, 'CONFLICT']);
  assert.equal(await (await get(ada, { spaceId, fileId: first.id })).text(), 'what Grace wrote');
  // The refused write left neither a version nor bytes
  assert.equal((await api.db.select().from(fileVersions).where(eq(fileVersions.fileId, first.id))).length, 2);
  assert.equal(await storedObjects(), stored);
  // Having read it again, Ada writes
  const current = await api.as(ada)(getFile, { spaceId, fileId: first.id });
  assert.ok(current.ok && current.data.file.version);
  const again = await put(ada, { ...base, baseVersionId: current.data.file.version.id }, 'both, merged by Ada');
  assert.equal(again.status, 200);
});

test('of two writes over the same version sent at the same moment, exactly one is taken', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'the original');
  const base = { spaceId, fileId: first.id, baseVersionId: first.version.id };
  const before = await storedObjects();

  const answers = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((content) => put(ada, base, content)));

  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409, 409, 409, 409]);
  assert.equal((await api.db.select().from(fileVersions).where(eq(fileVersions.fileId, first.id))).length, 2);
  // The four that were refused left no bytes
  assert.equal(await storedObjects(), before + 1);
});

/** Stores this content the way an upload does, ready to become a version */
const stored = (content: string) => storeContent(api.storage, new Blob([content]).stream());

/** What became of several writes that ran at the same moment: 'taken', or the error code each was refused with */
async function outcomes(writes: Promise<unknown>[]) {
  const settled = await Promise.allSettled(writes);
  return settled
    .map((result) => {
      if (result.status === 'fulfilled') return 'taken';
      if (result.reason instanceof ApiError) return result.reason.code;
      throw result.reason;
    })
    .sort();
}

test('when several writers have all passed the check and reach the database together, the database takes one: a new version', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'the original');
  const target = { spaceId, fileId: first.id, baseVersionId: first.version.id };
  const writer = { userId: ada.id, apiKeyId: null };
  // The bytes are stored beforehand, so that nothing spaces the writers out: they get to the row at the same time,
  // each having seen the version it replaces as the current one
  const contents = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(stored));

  const results = await outcomes(contents.map((content) => addVersionRow(api.db, target, content, writer)));

  assert.deepEqual(results, ['CONFLICT', 'CONFLICT', 'CONFLICT', 'CONFLICT', 'taken']);
  assert.equal((await api.db.select().from(fileVersions).where(eq(fileVersions.fileId, first.id))).length, 2);
});

test('when several writers reach the database together with the same new name, the database takes one: a new file', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const target = { spaceId, parentId: null, name: 'same.md' };
  const writer = { userId: ada.id, apiKeyId: null };
  const contents = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(stored));

  const results = await outcomes(contents.map((content) => createFileRow(api.db, target, content, writer)));

  assert.deepEqual(results, ['CONFLICT', 'CONFLICT', 'CONFLICT', 'CONFLICT', 'taken']);
  assert.equal((await api.db.select().from(files).where(eq(files.spaceId, spaceId))).length, 1);
});

test('an upload under a name that is taken is CONFLICT, refused before its bytes are stored', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  await upload(ada, { spaceId, name: 'notes.md' }, 'the original');
  const before = await storedObjects();

  for (const name of ['notes.md', 'Reports']) {
    assert.deepEqual(await failure(await put(ada, { spaceId, name }, 'another')), [409, 'CONFLICT'], name);
  }

  assert.equal(await storedObjects(), before);
  // The same name in another folder is another name
  assert.equal((await put(ada, { spaceId, parentId: reports, name: 'notes.md' }, 'another')).status, 200);
});

test('of two uploads under the same name sent at the same moment, one makes the file and the other leaves no bytes', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const before = await storedObjects();

  const answers = await Promise.all(
    ['a', 'b', 'c', 'd'].map((content) => put(ada, { spaceId, name: 'same.md' }, content))
  );

  assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409, 409, 409]);
  const listed = await api.as(ada)(getFiles, { spaceId, parentId: null });
  assert.deepEqual(listed.ok && listed.data.files.map((file) => file.name), ['same.md']);
  assert.equal(await storedObjects(), before + 1);
});

test('an upload that names a place or a file that is not there is NOT_FOUND, and one over a folder is CONFLICT', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const otherSpaceId = await makeSpace(ada, 'Reports');
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const elsewhere = await upload(ada, { spaceId: otherSpaceId, name: 'elsewhere.md' }, 'x');
  const trashed = await upload(ada, { spaceId, name: 'trashed.md' }, 'x');
  await api.as(ada)(trashFile, { spaceId, fileId: trashed.id });
  const before = await storedObjects();

  for (const [query, expected] of [
    [{ spaceId, parentId: NOBODY, name: 'a.md' }, [404, 'NOT_FOUND']],
    [{ spaceId, parentId: elsewhere.id, name: 'a.md' }, [404, 'NOT_FOUND']],
    [{ spaceId, fileId: NOBODY, baseVersionId: NOBODY }, [404, 'NOT_FOUND']],
    [{ spaceId, fileId: elsewhere.id, baseVersionId: elsewhere.version.id }, [404, 'NOT_FOUND']],
    [{ spaceId, fileId: trashed.id, baseVersionId: trashed.version.id }, [404, 'NOT_FOUND']],
    [{ spaceId, fileId: reports, baseVersionId: NOBODY }, [409, 'CONFLICT']]
  ] as const) {
    assert.deepEqual(await failure(await put(ada, query, 'content')), expected, JSON.stringify(query));
  }

  assert.equal(await storedObjects(), before);
});

test('an upload whose query or headers do not say what is needed is INVALID_INPUT, and one too large INPUT_TOO_LARGE', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const file = await upload(ada, { spaceId, name: 'notes.md' }, 'x');
  const before = await storedObjects();

  for (const query of [
    { name: 'a.md' },
    { spaceId },
    { spaceId, name: 'a/b' },
    { spaceId, name: 'a.md', parentId: 'not-an-id' },
    // A parameter that is not known is refused, not dropped: the file would land where the caller did not mean
    { spaceId, name: 'a.md', parentid: NOBODY },
    // Writing over a file without saying which version is replaced
    { spaceId, fileId: file.id }
  ]) {
    assert.deepEqual(await failure(await put(ada, query as never, 'x')), [400, 'INVALID_INPUT'], JSON.stringify(query));
  }
  const chunked = await put(ada, { spaceId, name: 'a.md' }, 'x', { 'transfer-encoding': 'chunked' });
  assert.deepEqual(await failure(chunked), [400, 'INVALID_INPUT']);
  const noLength = await api.send(ada, `${FILE_CONTENT_PATH}?${new URLSearchParams({ spaceId, name: 'a.md' })}`, {
    method: 'PUT',
    body: 'x'
  });
  assert.deepEqual(await failure(noLength), [400, 'INVALID_INPUT']);
  const tooLarge = await put(ada, { spaceId, name: 'a.md' }, 'x', { 'content-length': String(MAX_FILE_BYTES + 1) });
  assert.deepEqual(await failure(tooLarge), [413, 'INPUT_TOO_LARGE']);

  assert.equal(await storedObjects(), before);
});

test('one range of the content is answered as that range; a range with nothing in it is 416', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const content = randomBytes(10_000);
  const file = await upload(ada, { spaceId, name: 'data.bin' }, content);
  const query = { spaceId, fileId: file.id };

  for (const [range, start, end] of [
    ['bytes=0-0', 0, 0],
    ['bytes=1000-1999', 1000, 1999],
    ['bytes=9000-', 9000, 9999],
    ['bytes=-100', 9900, 9999],
    // Past the end, it is cut off at the end
    ['bytes=9990-20000', 9990, 9999]
  ] as const) {
    const response = await get(ada, query, { range });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/10000`, range);
    assert.equal(response.headers.get('content-length'), String(end - start + 1), range);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), content.subarray(start, end + 1), range);
  }

  const beyond = await get(ada, query, { range: 'bytes=10000-' });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get('content-range'), 'bytes */10000');
  // It says which version has nothing there, as every answer to a download says which version it is about
  assert.equal(beyond.headers.get('etag'), `"${file.version.id}"`);
  // A header this address does not serve is not an error: the whole content is sent
  for (const range of ['bytes=0-1,5-6', 'lines=1-2', 'bytes=abc']) {
    const whole = await get(ada, query, { range });
    assert.equal(whole.status, 200, range);
    assert.equal((await whole.arrayBuffer()).byteLength, 10_000, range);
  }
});

test('a download that goes on from an earlier one gets a range only of the version it began with', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await upload(ada, { spaceId, name: 'data.bin' }, 'first version');
  const query = { spaceId, fileId: first.id };
  const began = await get(ada, query, { range: 'bytes=0-4' });
  const etag = began.headers.get('etag') ?? '';
  assert.equal(await began.text(), 'first');

  // Still the same version: the rest of it
  const rest = await get(ada, query, { range: 'bytes=5-', 'if-range': etag });
  assert.deepEqual([rest.status, await rest.text()], [206, ' version']);

  // Somebody wrote in between. The rest of the new version would be glued onto the beginning of the old one, so
  // the whole of the new one is sent
  const written = await put(ada, { ...query, baseVersionId: first.version.id }, 'second version, longer');
  assert.equal(written.status, 200);
  const whole = await get(ada, query, { range: 'bytes=5-', 'if-range': etag });
  assert.deepEqual([whole.status, await whole.text()], [200, 'second version, longer']);
  assert.notEqual(whole.headers.get('etag'), etag);
});

test('rangeOf reads the three ways a range is written, against the size of the content', () => {
  assert.deepEqual(rangeOf('bytes=0-499', 1000), { start: 0, end: 499 });
  assert.deepEqual(rangeOf('bytes=500-', 1000), { start: 500, end: 999 });
  assert.deepEqual(rangeOf('bytes=-200', 1000), { start: 800, end: 999 });
  assert.deepEqual(rangeOf('bytes=-5000', 1000), { start: 0, end: 999 });
  assert.equal(rangeOf('bytes=1000-', 1000), 'none');
  assert.equal(rangeOf('bytes=5-2', 1000), 'none');
  assert.equal(rangeOf('bytes=-0', 1000), 'none');
  assert.equal(rangeOf('bytes=0-', 0), 'none');
  assert.equal(rangeOf(undefined, 1000), null);
  assert.equal(rangeOf('bytes=-', 1000), null);
});

test('a download of what is not there is NOT_FOUND: no such file, a folder, a file in the trash, a version of another file', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  const file = await upload(ada, { spaceId, name: 'notes.md' }, 'x');
  const other = await upload(ada, { spaceId, name: 'other.md' }, 'y');
  const trashed = await upload(ada, { spaceId, name: 'trashed.md' }, 'z');
  await api.as(ada)(trashFile, { spaceId, fileId: trashed.id });

  const queries: Record<string, string>[] = [
    { spaceId, fileId: NOBODY },
    { spaceId, fileId: reports },
    { spaceId, fileId: trashed.id },
    { spaceId, fileId: file.id, versionId: other.version.id },
    { spaceId, fileId: file.id, versionId: NOBODY }
  ];
  for (const query of queries) {
    assert.deepEqual(await failure(await get(ada, query)), [404, 'NOT_FOUND'], JSON.stringify(query));
  }
  assert.deepEqual(await failure(await get(ada, { spaceId })), [400, 'INVALID_INPUT']);
});

test('who may use the content address is decided as for an operation: the role, the key, the membership, the sign-in', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const stranger = await api.addPerson('Edsger');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'viewer' });
  const file = await upload(ada, { spaceId, name: 'notes.md' }, 'the original');
  const reader = { key: (await makeKey(ada, 'read')).key };
  const newFile = { spaceId, name: 'theirs.md' };
  const over = { spaceId, fileId: file.id, baseVersionId: file.version.id };
  const read = { spaceId, fileId: file.id };
  const before = await storedObjects();

  for (const [who, uploads, download] of [
    // A viewer, and a read-only key of the owner, read and do not write
    [grace, [403, 'FORBIDDEN'], 200],
    [reader, [403, 'FORBIDDEN'], 200],
    [stranger, [404, 'UNKNOWN_SPACE'], 404],
    [null, [401, 'UNAUTHENTICATED'], 401],
    [{ key: `pm_${'x'.repeat(43)}` }, [401, 'UNAUTHENTICATED'], 401]
  ] as const) {
    assert.deepEqual(await failure(await put(who, newFile, 'x')), uploads);
    assert.deepEqual(await failure(await put(who, over, 'x')), uploads);
    assert.equal((await get(who, read)).status, download);
  }

  assert.equal(await storedObjects(), before);
  assert.equal(await (await get(ada, read)).text(), 'the original');
  // A web page that is not on the list is refused, with or without anyone signed in
  const elsewhere = await api.send(ada, `${FILE_CONTENT_PATH}?${new URLSearchParams(read)}`, {
    headers: { origin: 'https://elsewhere.example' }
  });
  assert.deepEqual(await failure(elsewhere), [403, 'FORBIDDEN']);
});

test('what an agent writes belongs to its person, and every version records the key it came through, also once the key is deleted', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const key = await makeKey(ada, 'write', 'Drafting agent');
  const agent = { key: key.key };

  // The three ways a version comes to be, each through the key: a new file, a write over it, an old version
  // brought back. In between, Ada writes one herself
  const made = await upload(agent, { spaceId, name: 'draft.md' }, 'written by the agent');
  const byAda = await put(ada, { spaceId, fileId: made.id, baseVersionId: made.version.id }, 'revised by Ada');
  assert.equal(byAda.status, 200);
  const second = ((await byAda.json()) as { file: Uploaded }).file;
  const byAgent = await put(agent, { spaceId, fileId: made.id, baseVersionId: second.version.id }, 'revised again');
  assert.equal(byAgent.status, 200);
  const third = ((await byAgent.json()) as { file: Uploaded }).file;
  const restored = await api.withKey(key.key)(restoreFileVersion, {
    spaceId,
    fileId: made.id,
    versionId: made.version.id,
    baseVersionId: third.version.id
  });
  assert.ok(restored.ok, `restoreFileVersion should have worked: ${JSON.stringify(restored)}`);

  assert.deepEqual(made.version.user, { id: ada.id, name: 'Ada' });
  assert.deepEqual(made.version.apiKey, { id: key.id, name: 'Drafting agent' });
  const [row] = await api.db.select().from(files).where(eq(files.id, made.id));
  assert.equal(row?.userId, ada.id);
  await api.as(ada)(deleteApiKey, { apiKeyId: key.id });

  const versions = await api.as(ada)(getFileVersions, { spaceId, fileId: made.id });
  assert.deepEqual(versions.ok && versions.data.versions.map((version) => version.apiKey), [
    { id: key.id, name: 'Drafting agent' },
    { id: key.id, name: 'Drafting agent' },
    null,
    { id: key.id, name: 'Drafting agent' }
  ]);
  // The deleted key no longer gets in
  assert.deepEqual(await failure(await get(agent, { spaceId, fileId: made.id })), [401, 'UNAUTHENTICATED']);
});

test('getFileVersions lists the versions of a file, the latest first, a page at a time; a folder has none', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const reports = await makeFolder(ada, spaceId, null, 'Reports');
  let file = await upload(ada, { spaceId, name: 'notes.md' }, 'version 1');
  const ids = [file.version.id];
  for (const content of ['version 2', 'version 3', 'version 4', 'version 5']) {
    const response = await put(ada, { spaceId, fileId: file.id, baseVersionId: file.version.id }, content);
    file = ((await response.json()) as { file: Uploaded }).file;
    ids.push(file.version.id);
  }
  // The times are set by hand: 1 alone, 2 and 3 and 4 at one moment, 5 alone. The order must not hang on how fast
  // the test ran, and versions of one moment must be neither skipped nor repeated
  const at = ['09', '10', '10', '10', '11'];
  for (const [index, id] of ids.entries()) {
    await api.db
      .update(fileVersions)
      .set({ createdAt: new Date(`2026-03-01T${at[index]}:00:00.000Z`) })
      .where(eq(fileVersions.id, id));
  }

  const pages: string[][] = [];
  let cursor: string | undefined;
  do {
    const page = await api.as(ada)(getFileVersions, { spaceId, fileId: file.id, limit: 2, cursor });
    assert.ok(page.ok);
    pages.push(page.data.versions.map((version) => version.id));
    cursor = page.data.nextCursor ?? undefined;
  } while (cursor !== undefined);

  assert.deepEqual(
    pages.map((page) => page.length),
    [2, 2, 1]
  );
  const all = pages.flat();
  assert.equal(all[0], ids[4]);
  assert.equal(all[4], ids[0]);
  assert.deepEqual(all.slice(1, 4).sort(), ids.slice(1, 4).sort());
  assert.deepEqual(await api.as(ada)(getFileVersions, { spaceId, fileId: reports }), {
    ok: true,
    data: { versions: [], nextCursor: null }
  });
  const missing = await api.as(ada)(getFileVersions, { spaceId, fileId: NOBODY });
  assert.equal(!missing.ok && missing.code, 'NOT_FOUND');
});

test('restoreFileVersion brings an old version back as a new one with bytes of its own, written by whoever restored it', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'editor' });
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'the good version');
  const response = await put(ada, { spaceId, fileId: first.id, baseVersionId: first.version.id }, 'ruined');
  const second = ((await response.json()) as { file: Uploaded }).file;
  const before = await storedObjects();

  const restored = await api.as(grace)(restoreFileVersion, {
    spaceId,
    fileId: first.id,
    versionId: first.version.id,
    baseVersionId: second.version.id
  });

  assert.ok(restored.ok && restored.data.file.version);
  const { version } = restored.data.file;
  assert.notEqual(version.id, first.version.id);
  assert.deepEqual([version.size, version.sha256], [first.version.size, first.version.sha256]);
  assert.deepEqual(version.user, { id: grace.id, name: 'Grace' });
  assert.equal(await (await get(ada, { spaceId, fileId: first.id })).text(), 'the good version');
  // The history only grew: three versions, three objects
  const versions = await api.as(ada)(getFileVersions, { spaceId, fileId: first.id });
  assert.deepEqual(versions.ok && versions.data.versions.map((entry) => entry.id), [
    version.id,
    second.version.id,
    first.version.id
  ]);
  assert.equal(await storedObjects(), before + 1);
});

test('restoreFileVersion is a write: a viewer and a read-only key are refused, and nothing is stored', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'viewer' });
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'the good version');
  const response = await put(ada, { spaceId, fileId: first.id, baseVersionId: first.version.id }, 'ruined');
  const second = ((await response.json()) as { file: Uploaded }).file;
  const reader = await makeKey(ada, 'read');
  const before = await storedObjects();

  for (const call of [api.as(grace), api.withKey(reader.key)]) {
    const restored = await call(restoreFileVersion, {
      spaceId,
      fileId: first.id,
      versionId: first.version.id,
      baseVersionId: second.version.id
    });
    assert.equal(!restored.ok && restored.code, 'FORBIDDEN');
  }

  assert.equal(await storedObjects(), before);
  assert.equal(await (await get(ada, { spaceId, fileId: first.id })).text(), 'ruined');
});

test('restoreFileVersion is refused over a version the caller has not seen, and changes nothing when asked for the current one', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const first = await upload(ada, { spaceId, name: 'notes.md' }, 'one');
  const other = await upload(ada, { spaceId, name: 'other.md' }, 'other');
  const response = await put(ada, { spaceId, fileId: first.id, baseVersionId: first.version.id }, 'two');
  const second = ((await response.json()) as { file: Uploaded }).file;
  const before = await storedObjects();
  const restore = (versionId: string, baseVersionId: string, fileId = first.id) =>
    api.as(ada)(restoreFileVersion, { spaceId, fileId, versionId, baseVersionId });

  const stale = await restore(first.version.id, first.version.id);
  assert.equal(!stale.ok && stale.code, 'CONFLICT');
  for (const versionId of [other.version.id, NOBODY]) {
    const missing = await restore(versionId, second.version.id);
    assert.equal(!missing.ok && missing.code, 'NOT_FOUND', versionId);
  }
  const noFile = await restore(first.version.id, first.version.id, NOBODY);
  assert.equal(!noFile.ok && noFile.code, 'NOT_FOUND');

  const same = await restore(second.version.id, second.version.id);
  assert.equal(same.ok && same.data.file.version?.id, second.version.id);
  assert.equal(await storedObjects(), before);
  assert.equal((await api.db.select().from(fileVersions).where(eq(fileVersions.fileId, first.id))).length, 2);
});

// Regression: storing ran as two pipes side by side that shared a stream. A storage that failed before it read
// anything left the first pipe waiting for ever, so the upload never answered; and one that failed half way tore
// down the caller's stream with it, which was then read as the caller going away: the server's own failure was
// answered as INVALID_INPUT, and reported nowhere. The time limit is there so that the first fails, not hangs
test('a storage that fails is the server failing, before its first byte or half way: never an upload that broke off', {
  timeout: 10_000
}, async () => {
  const full = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
  // More than any stream holds on its own, so the bytes only move if the storage takes them
  const body = () => new Blob([randomBytes(4_000_000)]).stream();
  const refusesAtOnce: FileStorage = {
    ...api.storage,
    put: async () => {
      throw full;
    }
  };
  const failsHalfWay: FileStorage = {
    ...api.storage,
    put: async (_key, bytes) => {
      let taken = 0;
      const sink = new Writable({
        write(chunk: Buffer, _encoding, done) {
          taken += chunk.length;
          done(taken > 1_000_000 ? full : null);
        }
      });
      await pipeline(bytes, sink);
    }
  };

  await assert.rejects(storeContent(refusesAtOnce, body()), (error) => error === full);
  await assert.rejects(storeContent(failsHalfWay, body()), (error) => error === full);
});

// Regression: every failure of the step that writes the rows removed the bytes again. A failure that does not say
// whether the rows were written (the connection to the database lost just as it answered) then took the content
// away from under a version that exists
test('when the rows are written and the database is not heard to say so, the upload fails and the version keeps its bytes', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const file = await upload(ada, { spaceId, name: 'notes.md' }, 'one');
  // The database the api was built on: for the length of this test a transaction does its work, and then fails
  const { db } = api;
  const transaction = db.transaction.bind(db);
  db.transaction = (async (...run: Parameters<typeof transaction>) => {
    await transaction(...run);
    throw new Error('the connection to the database was lost');
  }) as typeof db.transaction;

  try {
    const response = await put(ada, { spaceId, fileId: file.id, baseVersionId: file.version.id }, 'two');

    assert.deepEqual(await failure(response), [500, 'INTERNAL']);
    assert.deepEqual(
      api.takeReported().map(({ error }) => (error as Error).message),
      ['the connection to the database was lost']
    );
  } finally {
    db.transaction = transaction;
  }
  // The version is there, and so is its content
  const response = await get(ada, { spaceId, fileId: file.id });
  assert.deepEqual([response.status, await response.text()], [200, 'two']);
});

test('renaming and moving a file leave its content alone, and it is found again by its new path', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const file = await upload(ada, { spaceId, name: 'draft.md' }, 'the content');

  const renamed = await api.as(ada)(updateFile, { spaceId, fileId: file.id, name: 'final.md', description: 'Sent.' });

  assert.ok(renamed.ok);
  assert.deepEqual(
    [renamed.data.file.path, renamed.data.file.description, renamed.data.file.version?.id],
    ['/final.md', 'Sent.', file.version.id]
  );
  const response = await get(ada, { spaceId, fileId: file.id });
  assert.equal(response.headers.get('content-disposition'), "attachment; filename*=UTF-8''final.md");
  assert.equal(await response.text(), 'the content');
});

test('an upload that breaks off is refused, and leaves neither a file nor bytes', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const before = await storedObjects();
  // The body gives some bytes and then fails, the way a connection that went away does
  async function* breaking() {
    yield randomBytes(100_000);
    throw new Error('the connection went away');
  }

  const response = await api.send(ada, `${FILE_CONTENT_PATH}?${new URLSearchParams({ spaceId, name: 'half.bin' })}`, {
    method: 'PUT',
    headers: { 'content-length': '500000' },
    body: Readable.toWeb(Readable.from(breaking())) as ReadableStream,
    duplex: 'half'
  } as RequestInit);

  assert.deepEqual(await failure(response), [400, 'INVALID_INPUT']);
  const listed = await api.as(ada)(getFiles, { spaceId, parentId: null });
  assert.deepEqual(listed.ok && listed.data.files, []);
  assert.equal(await storedObjects(), before);
});
