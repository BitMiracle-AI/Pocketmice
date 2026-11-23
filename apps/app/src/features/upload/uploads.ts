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

/**
 * Whether the list of the uploads is open. It is the page's, as the uploads are, and not the button's that opens
 * it: each frame has a button of its own (the sidebar of a space, of the settings, the bar of the start), and a
 * list the person closed in one stays closed in the next.
 */
const listOpen = createStore(false);

/** How much the list calls for the person: how many uploads it has, and again each that waits for them or failed */
function calling(uploads: readonly Upload[]): number {
  return uploads.length + uploads.filter((upload) => upload.state === 'taken' || upload.state === 'failed').length;
}

/** What the list called for when it was last published */
let called = 0;

/**
 * Publishes the uploads, and opens their list when it calls for the person more than it did: something was added
 * to it, a name that is taken has to be decided on, or a failure is to be seen. A list with nothing in it is shut.
 */
function publish(uploads: Upload[]): void {
  shown.set(uploads);
  const now = calling(uploads);
  if (now > called) listOpen.set(true);
  if (uploads.length === 0) listOpen.set(false);
  called = now;
}

const queue = createUploadQueue<Blob>({
  maxBytes: MAX_FILE_BYTES,
  atOnce: AT_ONCE,
  entriesAt,
  send: sendContent,
  changed: spaceChanged,
  publish
});

/** The uploads there are, the first one taken first. For the panel */
export const useUploads = shown.use;

/** Whether the list of the uploads is open, and the way to open and shut it. For the panel */
export const useUploadsOpen = listOpen.use;
export const setUploadsOpen = listOpen.set;

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
