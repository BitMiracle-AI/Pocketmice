import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  createFolder,
  fileContentPath,
  getFile,
  getFileDownloadUrl,
  getFileVersions
} from '@pocketmice/contract/domains/file';
import { createSpace, updateMemberStorageLimit, updateSpaceStorageLimit } from '@pocketmice/contract/domains/space';
import { isOperation } from '@pocketmice/contract/operation';
import { callTool, connectMcp } from '../../http/mcpClient.testing.ts';
import type { CurrentUser } from '../../http/operation.ts';
import { useTestApi } from '../testing.ts';
import { fileContentTools, MAX_TEXT_READ_BYTES, wholeCharacters } from './fileContentTools.ts';

// The MCP entrance on the whole api: its list of tools, and the three tools for the content of files. How the
// entrance treats a tool, whatever the tool is, is tested in http/mcp.test.ts.

const api = useTestApi();

/** A file as a tool answers with it */
interface Written {
  id: string;
  name: string;
  path: string;
  version: { id: string; size: number; apiKey: { id: string; name: string } | null };
}

/** What getFileContent says about the content it read */
interface About {
  versionId: string;
  size: number;
  nextCursor: string | null;
}

/** An id that is well written and names nothing */
const SOME_ID = '00000000-0000-4000-8000-000000000000';

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser) {
  const result = await api.as(owner)(createSpace, { name: 'Research notes' });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes an API key for this person and returns it, with the key itself */
async function makeKey(person: CurrentUser, permission: 'read' | 'write') {
  const result = await api.as(person)(createApiKey, { name: 'Research agent', permission });
  assert.ok(result.ok, `createApiKey should have worked: ${JSON.stringify(result)}`);
  return result.data.apiKey;
}

/** A client of the MCP entrance that calls with this key, the way an agent's host does */
function connect(key: string) {
  return connectMcp((path, init) => api.send({ key }, path, init));
}

/** Someone with a space of their own, and an agent connected with a read-write key of theirs */
async function setup() {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  const key = await makeKey(ada, 'write');
  return { ada, spaceId, key, client: await connect(key.key) };
}

type Client = Awaited<ReturnType<typeof connect>>;

/** Calls a tool that answers with a file, which must work, and returns the file */
async function written(client: Client, name: string, input: Record<string, unknown>): Promise<Written> {
  const called = await callTool(client, name, input);
  assert.equal(called.isError, false, `${name} should have worked: ${called.texts.join(' ')}`);
  return (JSON.parse(called.texts[0] ?? '') as { file: Written }).file;
}

/** Reads the content of a file with getFileContent, which must work: what it says about the content, and the text */
async function readPiece(client: Client, input: Record<string, unknown>): Promise<{ about: About; text: string }> {
  const called = await callTool(client, 'getFileContent', input);
  assert.equal(called.isError, false, `getFileContent should have worked: ${called.texts.join(' ')}`);
  assert.ok(called.texts.length <= 2);
  return { about: JSON.parse(called.texts[0] ?? '') as About, text: called.texts[1] ?? '' };
}

/** Uploads bytes to the content address as this person, the way a person does: a new file */
async function uploadBytes(
  person: CurrentUser,
  spaceId: string,
  name: string,
  bytes: Buffer<ArrayBuffer>
): Promise<Written> {
  const response = await api.send(person, fileContentPath({ spaceId, name }), {
    method: 'PUT',
    headers: { 'content-length': String(bytes.length) },
    body: bytes
  });
  assert.equal(response.status, 200);
  return ((await response.json()) as { file: Written }).file;
}

test('the tools of the api are the operations done as the person a key belongs to, and the three for the content of files', async () => {
  const { client } = await setup();

  // Every operation the contract defines, asked of its files the way implementations.test.ts asks
  const definitions = new URL('./domains/', import.meta.resolve('@pocketmice/contract/operation'));
  const byAccess: Record<string, string[]> = { authenticated: [], public: [], session: [] };
  for (const file of readdirSync(definitions).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
    const exported: Record<string, unknown> = await import(new URL(file, definitions).href);
    for (const value of Object.values(exported)) {
      if (isOperation(value)) byAccess[value.access]?.push(value.name);
    }
  }
  const { authenticated = [], public: forAnyone = [], session: forThePerson = [] } = byAccess;
  assert.ok(authenticated.length > 0 && forAnyone.length > 0 && forThePerson.length > 0);

  const listed = (await client.listTools()).tools.map(({ name }) => name);

  assert.deepEqual(
    listed.toSorted(),
    [...authenticated, 'createFile', 'getFileContent', 'updateFileContent'].toSorted()
  );
  // What anyone may call is not done as anybody, and what only the person does themselves no key does: neither is
  // offered to an agent. Asking for a sign-in code is among the first, making a key among the second
  for (const name of [...forAnyone, ...forThePerson]) {
    assert.equal(listed.includes(name), false, `${name} should not be a tool`);
  }
  assert.ok(forAnyone.includes('requestSignInCode') && forThePerson.includes('createApiKey'));
});

test('every tool takes the fields it names and no other: a cursor passed back under another name is refused, not read as none', async () => {
  const { spaceId, client } = await setup();

  // The three that are not operations write it themselves, and a fourth that did not would show here
  for (const { name, inputSchema } of (await client.listTools()).tools) {
    assert.equal(inputSchema.additionalProperties, false, `${name} should say that it takes no other field`);
  }

  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.md', content: 'A note.' });
  // Passed over, this would read the content from its start again, for as long as the agent went on asking
  const called = await callTool(client, 'getFileContent', {
    spaceId,
    fileId: file.id,
    versionId: null,
    nextCursor: 'abc'
  });
  assert.equal(called.isError, true);
  assert.match(called.texts[0] ?? '', /nextCursor/);
});

test('an agent finds its way with the tools of the operations: the space, a folder, the file in it', async () => {
  const { ada, spaceId, client } = await setup();
  const folder = await api.as(ada)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  assert.ok(folder.ok);

  const spaces = await callTool(client, 'getSpaces', {});
  assert.deepEqual(JSON.parse(spaces.texts[0] ?? ''), {
    spaces: [{ id: spaceId, name: 'Research notes', role: 'owner' }]
  });

  const file = await written(client, 'createFile', {
    spaceId,
    parentId: folder.data.file.id,
    name: 'summary.md',
    content: '# Summary\n'
  });
  assert.equal(file.path, '/Reports/summary.md');

  const found = await written(client, 'getFileByPath', { spaceId, path: '/Reports/summary.md' });
  assert.equal(found.id, file.id);
});

test('a text written with createFile is the content of a new file, written through the key, and reads back as it was', async () => {
  const { ada, spaceId, key, client } = await setup();
  const text = 'Line one\n第二行\n"quoted" and \\ and \t tab, and 🐭\n';

  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: text });

  assert.equal(file.name, 'notes.txt');
  assert.equal(file.version.size, Buffer.byteLength(text));
  // Who wrote what is on record: the agent's write names the key it came through
  assert.deepEqual(file.version.apiKey, { id: key.id, name: 'Research agent' });

  const { about, text: read } = await readPiece(client, { spaceId, fileId: file.id, versionId: null });
  assert.equal(read, text);
  assert.deepEqual(about, { versionId: file.version.id, size: Buffer.byteLength(text), nextCursor: null });

  // The same bytes a person downloads
  const where = await api.as(ada)(getFileDownloadUrl, { spaceId, fileId: file.id, versionId: null });
  assert.ok(where.ok);
  assert.equal(await (await fetch(where.data.url)).text(), text);
});

test('createFile is refused as an upload is: a name that is taken, a folder that is not there', async () => {
  const { spaceId, client } = await setup();
  await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'one' });

  const taken = await callTool(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'two' });
  assert.equal(taken.isError, true);
  assert.match(taken.texts[0] ?? '', /^CONFLICT: /);

  const nowhere = await callTool(client, 'createFile', {
    spaceId,
    parentId: SOME_ID,
    name: 'other.txt',
    content: 'two'
  });
  assert.equal(nowhere.isError, true);
  assert.match(nowhere.texts[0] ?? '', /^NOT_FOUND: /);
});

test('the tools that write are held by the storage limits as an upload is, by the bytes of the text: refused, and nothing written', async () => {
  const { ada, spaceId, client } = await setup();
  const first = await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'one' });
  // Four bytes may still be added: é is two of them
  assert.equal((await api.as(ada)(updateSpaceStorageLimit, { spaceId, storageLimit: 7 })).ok, true);

  const created = await callTool(client, 'createFile', { spaceId, parentId: null, name: 'b.txt', content: 'éée' });
  assert.equal(created.isError, true);
  assert.match(
    created.texts[0] ?? '',
    /^SPACE_STORAGE_LIMIT_EXCEEDED: .* holds 3 bytes and may hold 7: 5 more do not fit/
  );
  const over = { spaceId, fileId: first.id, baseVersionId: first.version.id };
  const updated = await callTool(client, 'updateFileContent', { ...over, content: 'three' });
  assert.equal(updated.isError, true);
  assert.match(updated.texts[0] ?? '', /^SPACE_STORAGE_LIMIT_EXCEEDED: /);

  // The limit of the member the key belongs to, with room left in the space
  assert.equal((await api.as(ada)(updateSpaceStorageLimit, { spaceId, storageLimit: null })).ok, true);
  assert.equal((await api.as(ada)(updateMemberStorageLimit, { spaceId, userId: ada.id, storageLimit: 7 })).ok, true);
  const mine = await callTool(client, 'updateFileContent', { ...over, content: 'three' });
  assert.equal(mine.isError, true);
  assert.match(mine.texts[0] ?? '', /^MEMBER_STORAGE_LIMIT_EXCEEDED: /);

  const versions = await api.as(ada)(getFileVersions, { spaceId, fileId: first.id });
  assert.equal(versions.ok && versions.data.versions.length, 1);
  // What fits is written, and an agent asks how much room there is with the tool of the operation
  await written(client, 'updateFileContent', { ...over, content: 'four' });
  const size = await callTool(client, 'getSpaceSize', { spaceId });
  assert.deepEqual(JSON.parse(size.texts[0] ?? ''), { storageSize: 7, storageLimit: null });
});

test('updateFileContent adds a version in place of the one that was read, and the versions before it stay', async () => {
  const { ada, spaceId, client } = await setup();
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'plan.md', content: 'first' });
  const { about } = await readPiece(client, { spaceId, fileId: file.id, versionId: null });

  const updated = await written(client, 'updateFileContent', {
    spaceId,
    fileId: file.id,
    baseVersionId: about.versionId,
    content: 'second'
  });

  assert.notEqual(updated.version.id, file.version.id);
  assert.equal((await readPiece(client, { spaceId, fileId: file.id, versionId: null })).text, 'second');
  // The version before is still there, and still reads
  assert.equal((await readPiece(client, { spaceId, fileId: file.id, versionId: file.version.id })).text, 'first');
  const versions = await api.as(ada)(getFileVersions, { spaceId, fileId: file.id });
  assert.ok(versions.ok);
  assert.deepEqual(
    versions.data.versions.map(({ id }) => id),
    [updated.version.id, file.version.id]
  );
});

test('nothing is written over unseen: updateFileContent on a version that is no longer current is CONFLICT, and writes nothing', async () => {
  const { ada, spaceId, client } = await setup();
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'plan.md', content: 'first' });
  // Somebody else writes in between
  const theirs = await written(client, 'updateFileContent', {
    spaceId,
    fileId: file.id,
    baseVersionId: file.version.id,
    content: 'theirs'
  });

  const called = await callTool(client, 'updateFileContent', {
    spaceId,
    fileId: file.id,
    baseVersionId: file.version.id,
    content: 'mine'
  });

  assert.equal(called.isError, true);
  assert.match(called.texts[0] ?? '', /^CONFLICT: /);
  const now = await api.as(ada)(getFile, { spaceId, fileId: file.id });
  assert.ok(now.ok);
  assert.equal(now.data.file.version?.id, theirs.version.id);
});

test('a long text is read a piece at a time, each piece whole characters, and the pieces together are the text', async () => {
  const { spaceId, client } = await setup();
  // Characters of one, two, three and four bytes, so that pieces end in the middle of some
  const text = 'aé字🐭'.repeat(Math.ceil((MAX_TEXT_READ_BYTES * 2.5) / 10));
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'long.txt', content: text });

  const pieces: string[] = [];
  let cursor: string | null = null;
  do {
    const { about, text: piece } = await readPiece(client, {
      spaceId,
      fileId: file.id,
      versionId: null,
      ...(cursor !== null && { cursor })
    });
    assert.deepEqual([about.versionId, about.size], [file.version.id, Buffer.byteLength(text)]);
    assert.ok(Buffer.byteLength(piece) <= MAX_TEXT_READ_BYTES);
    pieces.push(piece);
    cursor = about.nextCursor;
  } while (cursor !== null);

  assert.equal(pieces.length, 3);
  assert.equal(pieces.join(''), text);
});

test('reading on with a cursor stays in the version that was being read, whoever wrote to the file since', async () => {
  const { spaceId, client } = await setup();
  const old = 'old '.repeat(MAX_TEXT_READ_BYTES / 4 + 10);
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'long.txt', content: old });
  const first = await readPiece(client, { spaceId, fileId: file.id, versionId: null });
  assert.ok(first.about.nextCursor);

  await written(client, 'updateFileContent', {
    spaceId,
    fileId: file.id,
    baseVersionId: file.version.id,
    content: 'new'
  });
  const second = await readPiece(client, {
    spaceId,
    fileId: file.id,
    versionId: null,
    cursor: first.about.nextCursor
  });

  assert.equal(second.about.versionId, file.version.id);
  assert.equal(first.text + second.text, old);
  assert.equal(second.about.nextCursor, null);
});

test('a file with no content reads as no text, and still says which version to write over', async () => {
  const { spaceId, client } = await setup();
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'empty.txt', content: '' });
  assert.equal(file.version.size, 0);

  const called = await callTool(client, 'getFileContent', { spaceId, fileId: file.id, versionId: null });

  // One part, about the content, and no part of text
  assert.equal(called.isError, false);
  assert.deepEqual(
    called.texts.map((text) => JSON.parse(text)),
    [{ versionId: file.version.id, size: 0, nextCursor: null }]
  );

  const filled = await written(client, 'updateFileContent', {
    spaceId,
    fileId: file.id,
    baseVersionId: file.version.id,
    content: 'now it has some'
  });
  assert.equal(filled.version.size, 15);
});

test('content that is not text is not read: the answer says so, and which tool says where to download it', async () => {
  const { ada, spaceId, client } = await setup();
  // The first bytes of a PNG: not UTF-8
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x01]);
  const file = await uploadBytes(ada, spaceId, 'chart.png', image);

  const called = await callTool(client, 'getFileContent', { spaceId, fileId: file.id, versionId: null });

  assert.equal(called.isError, true);
  assert.match(called.texts[0] ?? '', /is not text: it is 12 bytes that are not UTF-8/);
  assert.ok(
    (called.texts[0] ?? '').includes(`getFileDownloadUrl with versionId ${file.version.id}`),
    'the answer should name the tool to ask, and the version that was read'
  );
  // Asked as it says, that tool gives an address that downloads those bytes
  const asked = await callTool(client, 'getFileDownloadUrl', {
    spaceId,
    fileId: file.id,
    versionId: file.version.id
  });
  assert.equal(asked.isError, false);
  const { url } = JSON.parse(asked.texts[0] ?? '') as { url: string };
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), image);
});

test('getFileContent is refused as a download is: a folder, a file or a version that is not there, a cursor that is not one', async () => {
  const { ada, spaceId, client } = await setup();
  const folder = await api.as(ada)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  assert.ok(folder.ok);
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'one' });

  for (const [input, code] of [
    [{ fileId: folder.data.file.id, versionId: null }, 'NOT_FOUND'],
    [{ fileId: SOME_ID, versionId: null }, 'NOT_FOUND'],
    [{ fileId: file.id, versionId: SOME_ID }, 'NOT_FOUND'],
    [{ fileId: file.id, versionId: null, cursor: 'page-2' }, 'INVALID_INPUT'],
    // A place no answer gave: a number too long to be a byte of any file
    [{ fileId: file.id, versionId: null, cursor: `${file.version.id}:${'9'.repeat(25)}` }, 'INVALID_INPUT']
  ] as const) {
    const called = await callTool(client, 'getFileContent', { spaceId, ...input });
    assert.equal(called.isError, true, JSON.stringify(input));
    assert.match(called.texts[0] ?? '', new RegExp(`^${code}: `), JSON.stringify(input));
  }
});

test('a cursor at the end of the content, or past it, reads nothing more', async () => {
  const { spaceId, client } = await setup();
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'one' });

  for (const from of [3, 4, MAX_TEXT_READ_BYTES * 1000]) {
    const called = await callTool(client, 'getFileContent', {
      spaceId,
      fileId: file.id,
      versionId: null,
      cursor: `${file.version.id}:${from}`
    });
    assert.deepEqual(
      called.texts.map((text) => JSON.parse(text)),
      [{ versionId: file.version.id, size: 3, nextCursor: null }],
      `from byte ${from}`
    );
  }
});

test('which version an empty content is, and that it is empty, come from one answer, and nothing is fetched for it', async () => {
  const getFileContent = fileContentTools.find(({ name }) => name === 'getFileContent');
  assert.ok(getFileContent);
  const empty = '11111111-1111-4111-8111-111111111111';
  const sent: string[] = [];

  // One answer of the api says which version the content is and that it has no bytes. Asked a second time what
  // the file is, the api would name the version somebody has written since: a caller told that one is empty would
  // write over content it never saw. And an address that is not fetched cannot fail: this one leads nowhere
  const called = await getFileContent.run({ spaceId: SOME_ID, fileId: SOME_ID, versionId: null }, async (path) => {
    sent.push(path);
    return Response.json({ url: 'http://127.0.0.1:9/nothing-listens-here', version: { id: empty, size: 0 } });
  });

  assert.deepEqual(
    called.content.map(({ text }) => JSON.parse(text)),
    [{ versionId: empty, size: 0, nextCursor: null }]
  );
  assert.deepEqual(sent, ['/api/getFileDownloadUrl']);
});

test('getFileContent takes a piece of the content and nothing else: an answer that is all of it is not read', async () => {
  const getFileContent = fileContentTools.find(({ name }) => name === 'getFileContent');
  assert.ok(getFileContent);
  const input = { spaceId: SOME_ID, fileId: SOME_ID, versionId: null };
  // A storage may answer a range with the whole content (status 200), which is up to 1 GB. This one answers that
  // way and never comes to an end: it goes on sending for as long as anyone takes it
  const chunk = Buffer.alloc(64 * 1024);
  let sent = 0;
  let closed: (() => void) | undefined;
  const gaveUp = new Promise<void>((resolve) => {
    closed = resolve;
  });
  const storage = createServer((_request, response) => {
    response.writeHead(200);
    const more = () => {
      while (response.write(chunk)) sent += chunk.length;
      sent += chunk.length;
    };
    response.on('drain', more);
    response.on('close', () => closed?.());
    more();
  }).listen(0, '127.0.0.1');
  await once(storage, 'listening');
  const { port } = storage.address() as AddressInfo;

  try {
    await assert.rejects(
      getFileContent.run(input, async () =>
        Response.json({ url: `http://127.0.0.1:${port}/`, version: { id: SOME_ID, size: 1024 ** 3 } })
      ),
      /answered a range with 200/
    );

    // The caller let go of the answer: the storage is told, and stops. What it had sent by then is what a
    // connection holds by itself, and no more
    await gaveUp;
    assert.ok(sent < 64 * 1024 * 1024, `${sent} bytes were sent`);
  } finally {
    storage.closeAllConnections();
    storage.close();
  }
});

test('a read-only key reads content with the tools and writes none; a space its person is not in does not exist for it', async () => {
  const { ada, spaceId, client } = await setup();
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'one' });
  const reader = await connect((await makeKey(ada, 'read')).key);

  assert.equal((await readPiece(reader, { spaceId, fileId: file.id, versionId: null })).text, 'one');
  for (const [name, input] of [
    ['createFile', { spaceId, parentId: null, name: 'other.txt', content: 'two' }],
    ['updateFileContent', { spaceId, fileId: file.id, baseVersionId: file.version.id, content: 'two' }]
  ] as const) {
    const called = await callTool(reader, name, input);
    assert.deepEqual(called, {
      texts: ['FORBIDDEN: This API key is read-only, and this request changes something.'],
      isError: true
    });
  }

  const grace = await api.addPerson('Grace');
  const stranger = await connect((await makeKey(grace, 'write')).key);
  const called = await callTool(stranger, 'getFileContent', { spaceId, fileId: file.id, versionId: null });
  assert.equal(called.isError, true);
  assert.match(called.texts[0] ?? '', /^UNKNOWN_SPACE: /);
});

test('wholeCharacters leaves out a character that is cut off at the end, and nothing else', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  assert.equal(wholeCharacters(bytes('')), 0);
  assert.equal(wholeCharacters(bytes('abc')), 3);
  for (const character of ['é', '字', '🐭']) {
    const whole = bytes(`ab${character}`);
    assert.equal(wholeCharacters(whole), whole.length, `${character}, whole`);
    for (let cut = 1; cut < bytes(character).length; cut++) {
      assert.equal(wholeCharacters(whole.subarray(0, whole.length - cut)), 2, `${character}, ${cut} bytes short`);
    }
  }
});
