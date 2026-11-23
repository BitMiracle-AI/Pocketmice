import type { Readable } from 'node:stream';

/**
 * The storage: where the bytes of files are kept. It knows nothing of files, versions or spaces. It keeps objects,
 * each a run of bytes under a key, and an object never changes once it is stored: it is read, copied, and at some
 * point removed.
 * The api names an object after the version whose content it is, so a key is always an id (see assertKey).
 * There are two of these: a folder on the disk of the machine the api runs on (folderStorage.ts) and a bucket of
 * an S3-compatible service (s3Storage.ts). fileStorage.test.ts puts both through the same tests.
 */
export interface FileStorage {
  /**
   * Stores the bytes the stream gives under key, however many they are, without gathering them in memory. A key is
   * used once: nothing is ever stored twice under one.
   * When this returns, the object is there, whole. When it fails, nothing is left under key: not the beginning of
   * an object either.
   */
  put: (key: string, bytes: Readable) => Promise<void>;
  /**
   * The bytes of the object under key, or the range of them from start to end, both counted from 0 and both
   * included.
   * MissingObject when there is nothing under key. That is known before the stream is handed over: a stream that
   * was handed over has bytes to give.
   */
  get: (key: string, range?: ByteRange) => Promise<Readable>;
  /** Stores under to a copy of the object under from. MissingObject when there is nothing under from */
  copy: (from: string, to: string) => Promise<void>;
  /** Removes the objects under these keys. A key with nothing under it is not an error: it is gone, as asked */
  delete: (keys: string[]) => Promise<void>;
}

/** A run of bytes inside an object: from start to end, both counted from 0 and both included */
export interface ByteRange {
  start: number;
  end: number;
}

/** There is nothing under the key that was asked for */
export class MissingObject extends Error {
  constructor(key: string) {
    super(`The storage has no object under ${key}.`);
    this.name = 'MissingObject';
  }
}

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Refuses a key that is not an id, written the one way ids are written. Every implementation asks this first: a
 * key becomes part of a path on disk, or of an address, and must not be able to point anywhere else.
 */
export function assertKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`"${key}" is not a key of the storage: a key is an id.`);
}
