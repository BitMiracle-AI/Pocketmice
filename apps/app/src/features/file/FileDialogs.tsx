import { useState } from 'react';
import { DescriptionDialog } from './DescriptionDialog';
import type { FileAction } from './FileMenu';
import type { DriveFile } from './files';
import { MoveDialog } from './MoveDialog';
import { RenameDialog } from './RenameDialog';
import { moveToTrash } from './trash';

// What the menu of a file does, for the pages that have such a menu: the list of a folder, and the page of a
// file. Three of the four things are done in a dialog; putting something in the trash takes none, since it can be
// undone, and the page says so.

/** What is being done to a file in a dialog: the dialog of that is open */
type Acting = { file: DriveFile; what: Exclude<FileAction, 'trash'> } | null;

/**
 * What a page with file menus holds: pick is what a menu calls with what was picked, and dialogs is handed to
 * FileDialogs as it is. leave is for the page of the file itself: where it goes once the file is in the trash
 * (see moveToTrash).
 */
export function useFileActions(spaceId: string, leave?: () => Promise<void>) {
  const [acting, setActing] = useState<Acting>(null);
  return {
    pick(file: DriveFile, what: FileAction): void {
      if (what === 'trash') void moveToTrash(spaceId, file, leave);
      else setActing({ file, what });
    },
    dialogs: { spaceId, acting, onClose: () => setActing(null) }
  };
}

/** The dialogs a file is renamed, described and moved in. One of them is open while acting says so */
export function FileDialogs({ spaceId, acting, onClose }: { spaceId: string; acting: Acting; onClose: () => void }) {
  const of = (what: NonNullable<Acting>['what']) => (acting?.what === what ? acting.file : null);
  return (
    <>
      <RenameDialog spaceId={spaceId} file={of('rename')} onClose={onClose} />
      <DescriptionDialog spaceId={spaceId} file={of('describe')} onClose={onClose} />
      <MoveDialog file={of('move')} onClose={onClose} />
    </>
  );
}
