import { deleteFile, emptyTrash, getTrashedFiles, restoreFile, trashFile } from '@pocketmice/contract/domains/file';
import type { OutputOf } from '@pocketmice/contract/operation';
import { toast } from '@/components/ui/toast';
import { call, failureText, readPages, spaceChanged } from '@/lib/api';
import type { DriveFile } from './files';
import { fileText } from './text';

// The trash of a space. Deleting something from a folder puts it here, and with a folder everything in it: nothing
// is removed, so the page does not ask "are you sure". It says what it did, with a button that undoes it.
// What is in the trash stays until the owner deletes it for good, which is the one thing that cannot be undone:
// that is asked about first.

/** How long the button that undoes a delete stays, in milliseconds */
const UNDO_FOR_MS = 8000;

/**
 * Puts a file or a folder in the trash, and says so with a way to undo it. Answers whether it is gone from where
 * it was: one that turns out to be gone already is gone, which is what was asked for.
 */
export async function moveToTrash(spaceId: string, file: Pick<DriveFile, 'id' | 'name'>): Promise<boolean> {
  const result = await call(trashFile, { spaceId, fileId: file.id });
  if (!result.ok && result.code !== 'NOT_FOUND') {
    toast.add({ type: 'error', title: failureText(result.code, {}) });
    return false;
  }
  spaceChanged(spaceId);
  if (!result.ok) return true;

  const said = toast.add({
    title: fileText.trashed(file.name),
    timeout: UNDO_FOR_MS,
    actionProps: {
      children: fileText.undo,
      onClick: () => {
        toast.close(said);
        void putBack(spaceId, file.id);
      }
    }
  });
  return true;
}

/**
 * Puts something that is in the trash back where it was. Answers with it as it is then; when it could not be put
 * back, the page says why and the answer is null.
 */
export async function putBack(spaceId: string, fileId: string): Promise<DriveFile | null> {
  const result = await call(restoreFile, { spaceId, fileId });
  // Whatever the answer, what the page shows of the trash or of the folder may be out of date
  spaceChanged(spaceId);
  if (!result.ok) {
    toast.add({
      type: 'error',
      title: failureText(result.code, { CONFLICT: fileText.restoreConflict, NOT_FOUND: fileText.restoreGone })
    });
    return null;
  }
  return result.data.file;
}

/**
 * What is in the trash of a space, the latest deleted first, a page at a time. Something that is there only
 * because a folder it is in was trashed is not listed: it comes back with the folder.
 */
export function trashQuery(spaceId: string) {
  return readPages(getTrashedFiles, { spaceId });
}

/** Something in the trash, as the api answers it: a file or a folder, and when it was put there */
export type TrashedFile = OutputOf<typeof getTrashedFiles>['files'][number];

/**
 * Deletes for good something that is in the trash. Null when it is gone, or the sentence that says why it is not.
 * One that turns out to be gone already is gone, which is what was asked for.
 */
export async function deleteForGood(spaceId: string, fileId: string): Promise<string | null> {
  const result = await call(deleteFile, { spaceId, fileId });
  spaceChanged(spaceId);
  return result.ok || result.code === 'NOT_FOUND' ? null : failureText(result.code, {});
}

/** Deletes for good everything in the trash of a space. Null when it is empty, or the sentence that says why not */
export async function emptyTheTrash(spaceId: string): Promise<string | null> {
  const result = await call(emptyTrash, { spaceId });
  spaceChanged(spaceId);
  return result.ok ? null : failureText(result.code, {});
}
