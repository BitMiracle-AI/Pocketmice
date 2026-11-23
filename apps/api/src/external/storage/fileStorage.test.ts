import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { after, before, test } from 'node:test';
import { type FileStorage, MissingObject } from './fileStorage.ts';
import { type MiniS3, startMiniS3 } from './miniS3.testing.ts';
import { createS3Storage } from './s3Storage.ts';

// What the api counts on from the storage. The bucket is the small S3 of miniS3.testing.ts, reached over a real
// socket by the real SDK.

/** The smallest part S3 allows in an upload that goes up in parts */
const PART_BYTES = 5 * 1024 * 1024;

let mini: MiniS3;
let storage: FileStorage;

before(async () => {
  mini = await startMiniS3();
  storage = createS3Storage({
    endpoint: mini.url,
    bucket: 'files',
    region: 'us-east-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    forcePathStyle: true,
    partBytes: PART_BYTES
  });
});
after(() => mini.close());

/** How many objects the bucket holds now, and how many uploads are left half done */
const count = () => ({ objects: mini.objects.size, halfDone: mini.uploads.size });

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

const put = async (bytes: Buffer) => {
  const key = randomUUID();
  await storage.put(key, Readable.from([bytes]));
  return key;
};
const read = async (key: string, range?: { start: number; end: number }) => buffer(await storage.get(key, range));

test('what is stored under a key is read back as it was, whole or one range of it', async () => {
  const bytes = randomBytes(64 * 1024);
  const key = await put(bytes);

  assert.deepEqual(await read(key), bytes);
  assert.deepEqual(await read(key, { start: 0, end: 0 }), bytes.subarray(0, 1));
  assert.deepEqual(await read(key, { start: 1000, end: 1999 }), bytes.subarray(1000, 2000));
  assert.deepEqual(await read(key, { start: bytes.length - 10, end: bytes.length - 1 }), bytes.subarray(-10));
});

test('an object of no bytes is an object', async () => {
  const key = await put(Buffer.alloc(0));

  assert.equal((await read(key)).length, 0);
});

test('an object larger than a part goes up in parts and is read back as it was', async () => {
  const bytes = randomBytes(PART_BYTES + 1024 * 1024 + 7);
  const key = randomUUID();
  // Given in small pieces, the way a request body arrives
  const pieces = Array.from({ length: Math.ceil(bytes.length / 65_536) }, (_, at) =>
    bytes.subarray(at * 65_536, (at + 1) * 65_536)
  );

  await storage.put(key, Readable.from(pieces));

  assert.equal(sha256(await read(key)), sha256(bytes));
  assert.equal(count().halfDone, 0);
});

test('reading, or copying, what is not there is MissingObject, known before a stream is handed over', async () => {
  const nothing = randomUUID();

  await assert.rejects(storage.get(nothing), MissingObject);
  await assert.rejects(storage.copy(nothing, randomUUID()), MissingObject);
});

test('a copy is an object of its own: it stays when the one it was copied from is removed', async () => {
  const bytes = randomBytes(4096);
  const from = await put(bytes);
  const to = randomUUID();

  await storage.copy(from, to);
  await storage.delete([from]);

  assert.deepEqual(await read(to), bytes);
  await assert.rejects(storage.get(from), MissingObject);
});

test('delete removes every key it is given, and one with nothing under it is no error', async () => {
  const keys = await Promise.all(Array.from({ length: 40 }, () => put(randomBytes(16))));
  const kept = await put(randomBytes(16));

  await storage.delete([...keys, randomUUID()]);
  await storage.delete([]);

  for (const key of keys) await assert.rejects(storage.get(key), MissingObject);
  assert.equal((await read(kept)).length, 16);
});

test('an upload whose stream breaks off fails, and leaves nothing under the key', async () => {
  const before = count();
  const key = randomUUID();
  // More than a part, so that a bucket has parts under way when the stream breaks
  async function* breaking() {
    for (let sent = 0; sent < PART_BYTES + 1024 * 1024; sent += 65_536) yield randomBytes(65_536);
    throw new Error('the connection went away');
  }

  await assert.rejects(storage.put(key, Readable.from(breaking())), /the connection went away/);

  await assert.rejects(storage.get(key), MissingObject);
  assert.deepEqual(count(), before);
});

test('a key that is not an id is refused, whatever is asked', async () => {
  for (const key of [
    '',
    'report.md',
    '../../etc/passwd',
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    `${randomUUID()}/x`
  ]) {
    await assert.rejects(storage.put(key, Readable.from([Buffer.from('x')])), /not a key of the storage/);
    await assert.rejects(storage.get(key), /not a key of the storage/);
    await assert.rejects(storage.copy(randomUUID(), key), /not a key of the storage/);
    await assert.rejects(storage.delete([key]), /not a key of the storage/);
    await assert.rejects(storage.downloadUrl(key, { saveAs: 'x', seconds: 60 }), /not a key of the storage/);
  }
});

test('a download address fetches the object without anything else, whole or a part, as a file to save under the name given', async () => {
  const bytes = randomBytes(4096);
  const key = await put(bytes);

  const url = await storage.downloadUrl(key, { saveAs: "报告 it's (final).md", seconds: 300 });

  // Nothing is sent along: no key, no sign-in. The address is all a caller holds
  const whole = await fetch(url);
  assert.equal(whole.status, 200);
  assert.deepEqual(Buffer.from(await whole.arrayBuffer()), bytes);
  // A file to save, under its name. Its type is the one every object is stored with: bytes, whatever they are
  assert.equal(
    whole.headers.get('content-disposition'),
    "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A%20it%27s%20%28final%29.md"
  );
  assert.equal(whole.headers.get('content-type'), 'application/octet-stream');

  const part = await fetch(url, { headers: { range: 'bytes=100-199' } });
  assert.equal(part.status, 206);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(100, 200));
  assert.equal(part.headers.get('content-disposition'), whole.headers.get('content-disposition'));
});

test('an object is stored as bytes of no particular kind, small or in parts, and so is a copy of it', async () => {
  const small = await put(Buffer.from('<html><script>alert(1)</script></html>'));
  const large = await put(randomBytes(PART_BYTES + 1024));
  const copy = randomUUID();
  await storage.copy(small, copy);

  for (const key of [small, large, copy]) {
    const answer = await fetch(await storage.downloadUrl(key, { saveAs: 'page.html', seconds: 60 }));
    await answer.arrayBuffer();
    assert.equal(answer.headers.get('content-type'), 'application/octet-stream');
  }
});

test('a download address is signed, for the time given and for the host callers reach the bucket at', async () => {
  const key = randomUUID();

  const address = new URL(await storage.downloadUrl(key, { saveAs: 'notes.md', seconds: 300 }));
  // Signed in the address itself, for five minutes, and the signature covers what the answer is to say of itself
  assert.equal(address.origin, mini.url);
  assert.equal(address.pathname, `/files/${key}`);
  assert.equal(address.searchParams.get('X-Amz-Expires'), '300');
  assert.match(address.searchParams.get('X-Amz-Signature') ?? '', /^[0-9a-f]{64}$/);
  assert.equal(address.searchParams.get('response-content-disposition'), "attachment; filename*=UTF-8''notes.md");
  // The address does not say what type the answer has: a service may refuse one that does
  assert.equal(address.searchParams.has('response-content-type'), false);

  // A server that reaches its bucket at one address and whose callers reach it at another signs for theirs, and
  // still reads and writes at its own
  const twoAddresses = createS3Storage({
    endpoint: mini.url,
    publicEndpoint: 'https://files.example.com',
    bucket: 'files',
    region: 'us-east-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    forcePathStyle: true
  });
  const stored = randomUUID();
  await twoAddresses.put(stored, Readable.from([Buffer.from('reached at its own address')]));
  assert.equal((await buffer(await twoAddresses.get(stored))).toString(), 'reached at its own address');
  const forCallers = new URL(await twoAddresses.downloadUrl(stored, { saveAs: 'notes.md', seconds: 60 }));
  assert.equal(forCallers.origin, 'https://files.example.com');
  assert.equal(forCallers.searchParams.get('X-Amz-Expires'), '60');
});
