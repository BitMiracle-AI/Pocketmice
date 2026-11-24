import type { Readable } from 'node:stream';

/**
 * The storage: where the bytes of files are kept. It knows nothing of files, versions or spaces. It keeps objects,
 * each a run of bytes under a key, and an object never changes once it is stored: it is copied, and at some point
 * removed.
 * The api does not read an object, and hands no bytes out: whoever is to have them is given an address of the
 * storage to fetch them from (downloadUrl).
 * The api names an object after the version whose content it is, so a key is always an id (see assertKey).
 * It is a bucket of an S3-compatible service (s3Storage.ts), and nothing else: what a running server keeps its
 * bytes in is what the tests and a developer's machine keep them in, so each is the same path through the code.
 */
export interface FileStorage {
  /**
   * Stores the bytes the stream gives under key, however many they are, without gathering them in memory. A key is
   * used once: nothing is ever stored twice under one.
   * When this returns, the object is there, whole. When it fails, nothing is left under key: not the beginning of
   * an object either.
   */
  put: (key: string, bytes: Readable) => Promise<void>;
  /** Stores under to a copy of the object under from. MissingObject when there is nothing under from */
  copy: (from: string, to: string) => Promise<void>;
  /** Removes the objects under these keys. A key with nothing under it is not an error: it is gone, as asked */
  delete: (keys: string[]) => Promise<void>;
  /**
   * An address the object under key is fetched from with a GET, by whoever holds the address and by nothing else
   * they hold: it is signed, and good for this many seconds from now. A Range header fetches a part of the object.
   * The answer is a file to save, called saveAs, and its type is that of bytes, as every object is stored: content
   * somebody uploaded must not be shown as a page, or run, by whoever opens the address.
   * It is the storage's own address, and not the api's: the bytes go from the storage to the caller, and do not
   * pass through the api.
   * Nothing is asked of the storage to make one. Whether there is an object under the key is not found out here:
   * an address for nothing is answered with a refusal when it is fetched.
   */
  downloadUrl: (key: string, download: { saveAs: string; seconds: number }) => Promise<string>;
}

/**
 * What tells whoever is sent some bytes to save them as a file called name: the content-disposition of an
 * attachment. The name is written the way that holds any character (RFC 5987), since a name may be in any script.
 * encodeURIComponent leaves four characters as they are that this way of writing does not allow: ' ( ) *. They are
 * written out too. Left as it is, a ' ends the name early for a browser: Chrome then drops the whole name, and
 * "it's done.md" is saved under a name of the browser's own.
 */
export function attachmentHeader(name: string): string {
  const written = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename*=UTF-8''${written}`;
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
 * Refuses a key that is not an id, written the one way ids are written. It is asked first, whatever is done with a
 * key: a key becomes part of an address, and must not be able to point anywhere else.
 */
export function assertKey(key: string): void {
  if (!KEY.test(key)) throw new Error(`"${key}" is not a key of the storage: a key is an id.`);
}
