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
  }
});
