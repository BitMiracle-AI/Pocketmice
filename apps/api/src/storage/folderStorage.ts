import { constants, createWriteStream } from 'node:fs';
import { copyFile, mkdir, open, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { assertKey, type FileStorage, MissingObject } from './fileStorage.ts';

/** How many objects are removed at the same time at most */
const REMOVALS_AT_ONCE = 32;

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === code;
}

/**
 * The storage that is a folder on the disk of this machine: one file for each object, named by its key.
 * It is what development and the tests use, and what a server on one machine can run on for good. It is not for
 * several api processes on different machines: they would each have a folder of their own.
 * The files are spread over subfolders named by the first two characters of the key, so that no folder ends up
 * with every file in it.
 */
export function createFolderStorage(dir: string): FileStorage {
  function pathOf(key: string): string {
    assertKey(key);
    return join(dir, key.slice(0, 2), key);
  }

  return {
    async put(key, bytes) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      try {
        // wx: it fails when there is a file already, since a key is used once and an object never changes.
        // flush: the bytes are asked to be on the disk before the file is closed. The row that points at them is
        // written next, and must not outlive them in a power cut
        await pipeline(bytes, createWriteStream(path, { flags: 'wx', flush: true }));
      } catch (error) {
        // The file that was there already is not this call's to remove
        if (!isCode(error, 'EEXIST')) await rm(path, { force: true });
        throw error;
      }
    },

    async get(key, range) {
      const path = pathOf(key);
      try {
        // Opened before the stream is made, so that a missing file is known now and not half way into a response
        const file = await open(path, 'r');
        return file.createReadStream(range);
      } catch (error) {
        throw isCode(error, 'ENOENT') ? new MissingObject(key) : error;
      }
    },

    async copy(from, to) {
      const target = pathOf(to);
      await mkdir(dirname(target), { recursive: true });
      try {
        await copyFile(pathOf(from), target, constants.COPYFILE_EXCL);
      } catch (error) {
        throw isCode(error, 'ENOENT') ? new MissingObject(from) : error;
      }
    },

    async delete(keys) {
      const paths = keys.map(pathOf);
      for (let at = 0; at < paths.length; at += REMOVALS_AT_ONCE) {
        await Promise.all(paths.slice(at, at + REMOVALS_AT_ONCE).map((path) => rm(path, { force: true })));
      }
    }
  };
}
