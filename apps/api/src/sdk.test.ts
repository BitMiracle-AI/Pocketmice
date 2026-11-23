import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openAsBlob } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';
import { apiKeyAuthorization, createApiKey } from '@pocketmice/contract/domains/apiKey';
import { fileContentPath } from '@pocketmice/contract/domains/file';
import { createPocketmice, type Pocketmice, PocketmiceError } from '@pocketmice/sdk';
import { useTestApi } from './domains/testing.ts';

// The SDK against the api, over a real connection: the fetch of Node on one side, a port on the other. The tests
// of the SDK itself (packages/sdk) send nothing, so they cannot tell whether what the SDK sends is what this
// server takes: above all that an upload arrives with its length, which only a real fetch decides.
// The test is here and not in the SDK's package because a package does not import an app, and the server is one.

const api = useTestApi();

/** A folder for the files this test file uploads from disk */
let dir: string;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pocketmice-test-sdk-'));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A person, a space of theirs, and a drive for each of two keys of theirs: one that writes, one that only reads */
async function start(): Promise<{ url: string; key: string; spaceId: string; drive: Pocketmice; reader: Pocketmice }> {
  const person = await api.addPerson();
  const url = await api.listen();
  // Making a key is what only the person does: no drive has a method for it
  const keys: string[] = [];
  for (const permission of ['write', 'read'] as const) {
    const made = await api.as(person)(createApiKey, { name: `sdk ${permission}`, permission });
    assert.ok(made.ok, `createApiKey should have worked: ${JSON.stringify(made)}`);
    keys.push(made.data.apiKey.key);
  }
  const [key = '', readKey = ''] = keys;
  const drive = createPocketmice({ url, apiKey: key });
  const { space } = await drive.createSpace({ name: 'Research' });
  return { url, key, spaceId: space.id, drive, reader: createPocketmice({ url, apiKey: readKey }) };
}

/** What a call that must fail threw, which must be a PocketmiceError: its code and the method */
async function refused(call: Promise<unknown>): Promise<[string, string]> {
  try {
    await call;
  } catch (thrown) {
    assert.ok(thrown instanceof PocketmiceError, `the call threw ${String(thrown)}, which is not a PocketmiceError`);
    return [thrown.code, thrown.operation];
  }
  return assert.fail('the call should have failed');
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

test('the operations are called as the person the key belongs to', async () => {
  const { spaceId, drive } = await start();

  assert.deepEqual((await drive.getSpaces()).spaces, [{ id: spaceId, name: 'Research', role: 'owner' }]);
  assert.equal((await drive.getProfile()).name, 'Ada');
  assert.equal((await drive.getServerInfo()).version, '1.2.3');

  const { file: folder } = await drive.createFolder({ spaceId, parentId: null, name: 'Reports' });
  assert.equal(folder.path, '/Reports');
  const { file: renamed } = await drive.updateFile({ spaceId, fileId: folder.id, name: 'Reports 2026' });
  assert.equal(renamed.path, '/Reports 2026');

  const page = await drive.getFiles({ spaceId, parentId: null });
  assert.deepEqual(
    page.files.map(({ name, kind }) => [name, kind]),
    [['Reports 2026', 'folder']]
  );
  assert.equal(page.nextCursor, null);
});

test('text, bytes and a file on disk are each uploaded with their length, and come back as they went', async () => {
  const { spaceId, drive } = await start();
  const { file: folder } = await drive.createFolder({ spaceId, parentId: null, name: 'Reports' });

  // Text, into a folder
  const { file: text } = await drive.uploadFile({
    spaceId,
    parentId: folder.id,
    name: 'summary.md',
    content: '# héllo'
  });
  assert.equal(text.path, '/Reports/summary.md');
  assert.equal(text.version?.size, Buffer.byteLength('# héllo'));
  // The version says which key wrote it
  assert.equal(text.version?.apiKey?.name, 'sdk write');
  assert.equal(await (await drive.downloadFile({ spaceId, fileId: text.id })).text(), '# héllo');

  // Bytes, directly in the space
  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
  const { file: binary } = await drive.uploadFile({ spaceId, parentId: null, name: 'raw.bin', content: bytes });
  assert.equal(binary.parentId, null);
  assert.deepEqual(await (await drive.downloadFile({ spaceId, fileId: binary.id })).bytes(), bytes);

  // A file on disk, as a Blob, under a name a query has to encode. Larger than one piece of a stream
  const onDisk = join(dir, 'big.bin');
  const large = Buffer.alloc(3 * 1024 * 1024, 'pocketmice');
  await writeFile(onDisk, large);
  const name = 'Q3 报告 & notes = a+b.bin';
  const { file: big } = await drive.uploadFile({ spaceId, parentId: null, name, content: await openAsBlob(onDisk) });
  assert.equal(big.name, name);
  assert.equal(big.version?.size, large.length);
  assert.equal(big.version?.sha256, sha256(large));
  // Read from the stream, piece by piece
  const pieces: Uint8Array[] = [];
  for await (const piece of (await drive.downloadFile({ spaceId, fileId: big.id })).body) pieces.push(piece);
  assert.equal(sha256(Buffer.concat(pieces)), sha256(large));

  // Content of no bytes is a file too
  const { file: empty } = await drive.uploadFile({ spaceId, parentId: null, name: 'empty.txt', content: '' });
  assert.equal(empty.version?.size, 0);
  const nothing = await drive.downloadFile({ spaceId, fileId: empty.id });
  assert.equal(nothing.versionId, empty.version?.id);
  assert.equal(await nothing.text(), '');
});

test('writing over a file names the version a download said it was, and a version that is no longer current is CONFLICT', async () => {
  const { spaceId, drive } = await start();
  const { file } = await drive.uploadFile({ spaceId, parentId: null, name: 'notes.md', content: 'one' });

  const first = await drive.downloadFile({ spaceId, fileId: file.id });
  assert.equal(first.versionId, file.version?.id);
  const base = first.versionId;
  assert.equal(await first.text(), 'one');

  const { file: second } = await drive.uploadFileVersion({
    spaceId,
    fileId: file.id,
    baseVersionId: base,
    content: 'two'
  });
  assert.notEqual(second.version?.id, base);

  // Written from the first version once more: somebody wrote in between, here the same drive
  assert.deepEqual(
    await refused(drive.uploadFileVersion({ spaceId, fileId: file.id, baseVersionId: base, content: 'lost?' })),
    ['CONFLICT', 'uploadFileVersion']
  );
  assert.equal(await (await drive.downloadFile({ spaceId, fileId: file.id })).text(), 'two');

  // The version before is still there, and is read by its id
  assert.equal(await (await drive.downloadFile({ spaceId, fileId: file.id, versionId: base })).text(), 'one');
  const { versions } = await drive.getFileVersions({ spaceId, fileId: file.id });
  assert.deepEqual(
    versions.map(({ id }) => id),
    [second.version?.id, base]
  );
});

test('what the server refuses is thrown with its code: by an operation and by the content alike', async () => {
  const { url, spaceId, drive, reader } = await start();
  const { file: folder } = await drive.createFolder({ spaceId, parentId: null, name: 'Reports' });
  const { file } = await drive.uploadFile({ spaceId, parentId: null, name: 'a.md', content: 'a' });

  assert.deepEqual(await refused(drive.getFileByPath({ spaceId, path: '/nope.md' })), ['NOT_FOUND', 'getFileByPath']);
  assert.deepEqual(await refused(drive.uploadFile({ spaceId, parentId: null, name: 'a.md', content: 'again' })), [
    'CONFLICT',
    'uploadFile'
  ]);
  // A folder has no content. What is thrown is the refusal: it is not handed over as the bytes of a file
  assert.deepEqual(await refused(drive.downloadFile({ spaceId, fileId: folder.id })), ['NOT_FOUND', 'downloadFile']);

  // A key that only reads: reads work, and every write is refused, an upload before any of it is taken
  assert.equal((await reader.getFile({ spaceId, fileId: file.id })).file.name, 'a.md');
  assert.equal(await (await reader.downloadFile({ spaceId, fileId: file.id })).text(), 'a');
  assert.deepEqual(await refused(reader.trashFile({ spaceId, fileId: file.id })), ['FORBIDDEN', 'trashFile']);
  assert.deepEqual(await refused(reader.uploadFile({ spaceId, parentId: null, name: 'b.md', content: 'b' })), [
    'FORBIDDEN',
    'uploadFile'
  ]);

  // A key nobody made, and a port nothing listens on
  const stranger = createPocketmice({ url, apiKey: 'pm_nobody-made-this-key' });
  assert.deepEqual(await refused(stranger.getSpaces()), ['UNAUTHENTICATED', 'getSpaces']);
  assert.deepEqual(await refused(stranger.downloadFile({ spaceId, fileId: file.id })), [
    'UNAUTHENTICATED',
    'downloadFile'
  ]);
  const nowhere = createPocketmice({ url: 'http://127.0.0.1:1', apiKey: 'pm_any' });
  assert.deepEqual(await refused(nowhere.getSpaces()), ['UNREACHABLE', 'getSpaces']);
});

test('an address that redirects is not followed: the call fails with the status, not as if the key were wrong', async () => {
  // What a server does that is reached over http and wants https: it redirects to another origin. A fetch that
  // follows it there drops the key on the way, and every call is refused as UNAUTHENTICATED with a key that works
  const { url, key, spaceId } = await start();
  const redirecting = createServer((request, response) => {
    response.writeHead(308, { location: `${url}${request.url}` }).end();
  });
  await new Promise<void>((resolve) => redirecting.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = redirecting.address() as AddressInfo;
    const drive = createPocketmice({ url: `http://127.0.0.1:${port}`, apiKey: key });

    assert.deepEqual(await refused(drive.getSpaces()), ['BAD_RESPONSE', 'getSpaces']);
    assert.deepEqual(await refused(drive.uploadFile({ spaceId, parentId: null, name: 'a.md', content: 'a' })), [
      'BAD_RESPONSE',
      'uploadFile'
    ]);
    // Nothing was written by the way
    const { files } = await createPocketmice({ url, apiKey: key }).getFiles({ spaceId, parentId: null });
    assert.deepEqual(files, []);
  } finally {
    redirecting.closeAllConnections();
    redirecting.close();
  }
});

test('what the SDK leaves out is refused by the server: a stream, sent by the fetch of Node, comes without a length', async () => {
  // Why Content has no stream in it. If this server ever takes an upload without a length, this test fails, and
  // Content can take a stream
  const { url, key, spaceId } = await start();

  const response = await fetch(new URL(fileContentPath({ spaceId, name: 'stream.bin' }), url), {
    method: 'PUT',
    headers: { authorization: apiKeyAuthorization(key) },
    body: Readable.toWeb(Readable.from([Buffer.from('some bytes')])) as ReadableStream,
    duplex: 'half'
  } as RequestInit);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: 'INVALID_INPUT', message: 'Send the content with a content-length header, not in chunks.' }
  });
});
