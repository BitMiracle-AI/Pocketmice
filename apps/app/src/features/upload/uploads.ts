import { MAX_FILE_BYTES } from '@pocketmice/contract/domains/file';
import { folderQuery } from '@/features/file/files';
import { ApiFailure, queryClient, spaceChanged } from '@/lib/api';
import { createStore } from '@/lib/store';
import { sendContent } from './sendContent';
import { uploadText } from './text';
import { createUploadQueue, type Entries, type Upload } from './uploadQueue';

// The uploads of this page: the rules of uploadQueue.ts, given the folder as the cache knows it and the browser to
// send with. They are the page's and no folder's: they go on while the person looks at another folder, and the
// panel that shows them is part of the frame.

/** How many files go up at one time. More would only share the same line */
const AT_ONCE = 3;

const shown = createStore<Upload[]>([]);

/**
 * What is in a folder, by name: read through the cache, so that a folder the page is showing is not asked for
 * twice. fresh asks the api whatever the cache holds.
 */
async function entriesAt(spaceId: string, parentId: string | null, fresh: boolean): Promise<Entries> {
  try {
    const query = folderQuery(spaceId, parentId);
    const files = await queryClient.fetchQuery(fresh ? { ...query, staleTime: 0 } : query);
    return {
      ok: true,
      entries: new Map(files.map((file) => [file.name, { fileId: file.id, versionId: file.version?.id ?? null }]))
    };
  } catch (error) {
    if (error instanceof ApiFailure) return { ok: false, code: error.code };
    throw error;
  }
}

const queue = createUploadQueue<Blob>({
  maxBytes: MAX_FILE_BYTES,
  atOnce: AT_ONCE,
  entriesAt,
  send: sendContent,
  changed: spaceChanged,
  publish: shown.set
});

/** The uploads there are, the first one taken first. For the panel */
export const useUploads = shown.use;

/**
 * Takes the files a person picked, to upload into a folder (parentId null: directly in the space).
 * A name is written the way the server keeps one, so that it is found among the names the folder has: macOS hands
 * out names with their accents written apart.
 */
export function uploadFiles(spaceId: string, parentId: string | null, files: readonly File[]): void {
  queue.add(
    spaceId,
    parentId,
    files.map((file) => ({ name: file.name.normalize('NFC').trim(), size: file.size, content: file }))
  );
}

export const decideUpload = queue.decide;
export const retryUpload = queue.retry;
export const cancelUpload = queue.cancel;
export const clearUploads = queue.clear;

// Closing the page, or opening it anew, while files are going up loses them: the browser is made to ask first.
// What it asks is in its own words; the sentence is for the browsers that still show one.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    if (!shown.get().some((upload) => upload.state === 'waiting' || upload.state === 'sending')) return;
    event.preventDefault();
    event.returnValue = uploadText.leaving;
  });
}
