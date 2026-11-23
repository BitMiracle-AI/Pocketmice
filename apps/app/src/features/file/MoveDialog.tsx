import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { getFile, moveFile } from '@pocketmice/contract/domains/file';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { SpaceMark } from '@/features/space/SpaceMark';
import { useLastGiven } from '@/hooks/useLastGiven';
import { ApiFailure, call, failureText, queryClient, readQuery, spaceChanged, thrownText } from '@/lib/api';
import { FileIcon } from './FileIcon';
import { type DriveFile, folderQuery } from './files';
import { fileText } from './text';

/** A folder the dialog is looking into: what it takes to name it, to move into it and to go up from it */
type Place = Pick<DriveFile, 'id' | 'name' | 'parentId'>;

/**
 * The dialog a file or a folder is moved in: the person walks through the folders of the space, and moves it into
 * the one they are looking at. It starts in from, the folder the file is in now (null: directly in the space).
 * It is open while there is a file to move; onClose is called when it was moved, and when the person gave up.
 */
export function MoveDialog({
  file,
  from,
  onClose
}: {
  file: DriveFile | null;
  from: DriveFile | null;
  onClose: () => void;
}) {
  const shown = useLastGiven(file);
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{shown && <MoveForm file={shown} from={from} onDone={onClose} />}</DialogContent>
    </Dialog>
  );
}

function MoveForm({ file, from, onDone }: { file: DriveFile; from: DriveFile | null; onDone: () => void }) {
  const space = useCurrentSpace();
  // The folder being looked into. Null is the space itself
  const [at, setAt] = useState<Place | null>(from);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inside = useQuery(folderQuery(space.id, at?.id ?? null));

  // A folder is not offered as a place to move itself into: it cannot be walked into, nor what is inside it
  const folders = inside.data?.filter((each) => each.kind === 'folder' && each.id !== file.id);
  const alreadyHere = (at?.id ?? null) === file.parentId;
  const taken = !alreadyHere && inside.data?.some((each) => each.name === file.name);

  const go = (place: Place | null) => {
    setAt(place);
    setProblem(null);
  };

  /** One folder up. The folder above is asked for by its id: of the one being looked into only that is known */
  const up = async () => {
    if (!at || busy) return;
    if (at.parentId === null) return go(null);
    setBusy(true);
    try {
      const above = await queryClient.fetchQuery(readQuery(getFile, { spaceId: space.id, fileId: at.parentId }));
      go(above.file);
    } catch (error) {
      // The folder above is gone, so this one went with it: the person starts again from the top
      if (error instanceof ApiFailure && error.code === 'NOT_FOUND') go(null);
      else setProblem(thrownText(error));
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    if (busy) return;
    setBusy(true);
    const result = await call(moveFile, { spaceId: space.id, fileId: file.id, parentId: at?.id ?? null });
    setBusy(false);
    if (!result.ok) {
      // What the dialog and the page show may be what led here: both are asked for again
      if (result.code === 'CONFLICT' || result.code === 'NOT_FOUND') spaceChanged(space.id);
      return setProblem(failureText(result.code, { CONFLICT: fileText.moveConflict, NOT_FOUND: fileText.moveGone }));
    }
    spaceChanged(space.id);
    toast.add({ title: fileText.moved(file.name, at?.name ?? space.name) });
    onDone();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">{fileText.moveTitle(file.name)}</DialogTitle>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex h-8 min-w-0 items-center gap-2">
          {at ? (
            <Button variant="ghost" size="icon-sm" aria-label={fileText.moveUp} title={fileText.moveUp} onClick={up}>
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
          ) : (
            <SpaceMark name={space.name} />
          )}
          <span className="truncate font-medium">{at?.name ?? space.name}</span>
        </div>

        <div className="h-56 overflow-y-auto rounded-2xl border p-1">
          {inside.isPending ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : inside.isError ? (
            <p role="alert" className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
              {inside.error.code === 'NOT_FOUND' ? fileText.moveGone : thrownText(inside.error)}
            </p>
          ) : folders?.length === 0 ? (
            <p className="flex h-full items-center justify-center text-muted-foreground">{fileText.moveNoFolders}</p>
          ) : (
            <ul>
              {folders?.map((each) => (
                <li key={each.id}>
                  <button
                    type="button"
                    onClick={() => go(each)}
                    className="flex h-9 w-full min-w-0 items-center gap-3 rounded-xl px-2.5 text-left outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/30"
                  >
                    <FileIcon name={each.name} folder className="size-4.5" />
                    <span className="min-w-0 flex-1 truncate">{each.name}</span>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* One line under the list, kept whether it says something or not: the buttons below do not jump */}
        <p role={problem !== null ? 'alert' : undefined} className="min-h-5 text-muted-foreground">
          {problem !== null ? (
            <span className="text-destructive">{problem}</span>
          ) : alreadyHere ? (
            fileText.moveAlreadyHere
          ) : taken ? (
            fileText.moveTaken(file.name)
          ) : null}
        </p>
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{fileText.cancel}</DialogClose>
        <Button disabled={busy || alreadyHere || taken || !inside.isSuccess} onClick={move}>
          {busy && <Spinner data-icon="inline-start" />}
          {fileText.moveHere}
        </Button>
      </DialogFooter>
    </>
  );
}
