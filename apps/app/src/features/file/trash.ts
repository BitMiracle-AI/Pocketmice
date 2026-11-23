import { restoreFile, trashFile } from '@pocketmice/contract/domains/file';
import { toast } from '@/components/ui/toast';
import { call, failureText, spaceChanged } from '@/lib/api';
import type { DriveFile } from './files';
import { fileText } from './text';

// The trash of a space. Deleting something from a folder puts it here, and with a folder everything in it: nothing
// is removed, so the page does not ask "are you sure". It says what it did, with a button that undoes it.

/** How long the button that undoes a delete stays, in milliseconds */
const UNDO_FOR_MS = 8000;

/**
 * Puts a file or a folder in the trash, and says so with a way to undo it. One that turns out to be gone already
 * is gone, which is what was asked for.
 */
export async function moveToTrash(spaceId: string, file: Pick<DriveFile, 'id' | 'name'>): Promise<void> {
  const result = await call(trashFile, { spaceId, fileId: file.id });
  if (!result.ok && result.code !== 'NOT_FOUND') {
    toast.add({ type: 'error', title: failureText(result.code, {}) });
    return;
  }
  spaceChanged(spaceId);
  if (!result.ok) return;

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
