import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import { createFolder, fileContentPath, getFile, getFileVersions } from '@pocketmice/contract/domains/file';
import { createSpace } from '@pocketmice/contract/domains/space';
import { isOperation } from '@pocketmice/contract/operation';
import { callTool, connectMcp } from '../../http/mcpClient.testing.ts';
import type { CurrentUser } from '../../http/operation.ts';
import { useTestApi } from '../testing.ts';
import { MAX_TEXT_READ_BYTES, wholeCharacters } from './fileContentTools.ts';

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

test('the tools of the api are the operations an API key may call and the three for the content of files', async () => {
  const { client } = await setup();

  // Every operation the contract defines, asked of its files the way implementations.test.ts asks
  const definitions = new URL('./domains/', import.meta.resolve('@pocketmice/contract/operation'));
  const forKeys: string[] = [];
  const forThePerson: string[] = [];
  for (const file of readdirSync(definitions).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))) {
    const exported: Record<string, unknown> = await import(new URL(file, definitions).href);
    for (const value of Object.values(exported)) {
      if (isOperation(value)) (value.access === 'session' ? forThePerson : forKeys).push(value.name);
    }
  }
  assert.ok(forKeys.length > 0 && forThePerson.length > 0);

  const listed = (await client.listTools()).tools.map(({ name }) => name);

  assert.deepEqual(listed.toSorted(), [...forKeys, 'createFile', 'getFileContent', 'updateFileContent'].toSorted());
  // What only the person does themselves is not offered to an agent at all
  for (const name of forThePerson) assert.equal(listed.includes(name), false, `${name} should not be a tool`);
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
  const downloaded = await api.send(ada, fileContentPath({ spaceId, fileId: file.id }));
  assert.equal(await downloaded.text(), text);
});

test('createFile is refused as an upload is: a name that is taken, a folder that is not there', async () => {
  const { spaceId, client } = await setup();
  await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'one' });

  const taken = await callTool(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'two' });
  assert.equal(taken.isError, true);
  assert.match(taken.texts[0] ?? '', /^CONFLICT: /);

  const nowhere = await callTool(client, 'createFile', {
    spaceId,
    parentId: '00000000-0000-4000-8000-000000000000',
    name: 'other.txt',
    content: 'two'
  });
  assert.equal(nowhere.isError, true);
  assert.match(nowhere.texts[0] ?? '', /^NOT_FOUND: /);
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

test('content that is not text is not read: the answer says so, and where to download it', async () => {
  const { ada, spaceId, client } = await setup();
  // The first bytes of a PNG: not UTF-8
  const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x01]);
  const file = await uploadBytes(ada, spaceId, 'chart.png', image);

  const called = await callTool(client, 'getFileContent', { spaceId, fileId: file.id, versionId: null });

  assert.equal(called.isError, true);
  assert.match(called.texts[0] ?? '', /is not text: it is 12 bytes that are not UTF-8/);
  const address = /GET (\S+)/.exec(called.texts[0] ?? '')?.[1];
  assert.ok(address, 'the answer should give the address to download from');
  // The address it gives is the one that downloads those bytes
  const downloaded = await api.send(ada, address);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), image);
});

test('getFileContent is refused as a download is: a folder, a file or a version that is not there, a cursor that is not one', async () => {
  const { ada, spaceId, client } = await setup();
  const folder = await api.as(ada)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  assert.ok(folder.ok);
  const file = await written(client, 'createFile', { spaceId, parentId: null, name: 'notes.txt', content: 'one' });
  const nothing = '00000000-0000-4000-8000-000000000000';

  for (const [input, code] of [
    [{ fileId: folder.data.file.id, versionId: null }, 'NOT_FOUND'],
    [{ fileId: nothing, versionId: null }, 'NOT_FOUND'],
    [{ fileId: file.id, versionId: nothing }, 'NOT_FOUND'],
    [{ fileId: file.id, versionId: null, cursor: 'page-2' }, 'INVALID_INPUT']
  ] as const) {
    const called = await callTool(client, 'getFileContent', { spaceId, ...input });
    assert.equal(called.isError, true, JSON.stringify(input));
    assert.match(called.texts[0] ?? '', new RegExp(`^${code}: `), JSON.stringify(input));
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
