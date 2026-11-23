import { useState } from 'react';
import { DescriptionDialog } from './DescriptionDialog';
import type { DriveFile } from './files';
import { MoveDialog } from './MoveDialog';
import { RenameDialog } from './RenameDialog';
import { moveToTrash } from './trash';

// What an editor does to a file or a folder, for the places that offer it: the menu of a row in the columns, and
// the buttons of the pane that shows what was picked. Three of the four things are done in a dialog; putting
// something in the trash takes none, since it can be undone, and the page says so.

/** What can be done to a file or a folder. Each changes it, so they are there for an editor */
export type FileAction = 'rename' | 'describe' | 'move' | 'trash';

/** What is being done to a file in a dialog: the dialog of that is open */
type Acting = { file: DriveFile; what: Exclude<FileAction, 'trash'> } | null;

/**
 * What a place that offers these things holds: pick is called with the file and what was picked for it, and
 * dialogs is handed to FileDialogs as it is.
 * leave is for a page that shows the file itself, or something inside it: it is called once the file is in the
 * trash, and takes the person elsewhere when the page has nothing left to show (see moveToTrash).
 */
export function useFileActions(spaceId: string, leave?: (file: DriveFile) => Promise<void>) {
  const [acting, setActing] = useState<Acting>(null);
  return {
    pick(file: DriveFile, what: FileAction): void {
      if (what === 'trash') void moveToTrash(spaceId, file, leave && (() => leave(file)));
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
