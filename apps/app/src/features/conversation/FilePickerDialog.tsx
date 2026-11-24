import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { PickBox, PickRow } from '@/components/PickBox';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { FileIcon } from '@/features/file/FileIcon';
import { type DriveFile, folderQuery } from '@/features/file/files';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { SpaceMark } from '@/features/space/SpaceMark';
import { thrownText } from '@/lib/api';
import { conversationText } from './text';

/** A file or a folder a message is going to point at: what it takes to send it and to name it */
export type PickedFile = Pick<DriveFile, 'id' | 'name' | 'kind'>;

/**
 * The dialog the files a message points at are picked in: the person walks through the folders of the space and
 * ticks files and folders, max of them at most. A message points at what is in the space already; nothing is
 * uploaded from here.
 * picked is what is ticked to begin with. onDone is called with what is ticked when the person is done, and with
 * null when they gave up.
 */
export function FilePickerDialog({
  open,
  picked,
  max,
  onDone
}: {
  open: boolean;
  picked: readonly PickedFile[];
  max: number;
  onDone: (picked: PickedFile[] | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDone(null)}>
      {/* Where the person walked to and what they ticked is kept inside the dialog: closed, it is gone */}
      <DialogContent>{open && <FilePicker picked={picked} max={max} onDone={onDone} />}</DialogContent>
    </Dialog>
  );
}

function FilePicker({
  picked,
  max,
  onDone
}: {
  picked: readonly PickedFile[];
  max: number;
  onDone: (picked: PickedFile[]) => void;
}) {
  const space = useCurrentSpace();
  // The folders walked into, the one being looked into last. None: the space itself
  const [trail, setTrail] = useState<readonly PickedFile[]>([]);
  const [ticked, setTicked] = useState<readonly PickedFile[]>(picked);
  const at = trail.at(-1) ?? null;
  const inside = useQuery(folderQuery(space.id, at?.id ?? null));
  const full = ticked.length >= max;
  const idPrefix = useId();

  const tick = (file: DriveFile, on: boolean) =>
    setTicked(
      on ? [...ticked, { id: file.id, name: file.name, kind: file.kind }] : ticked.filter((each) => each.id !== file.id)
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{conversationText.pointAtFiles}</DialogTitle>
        <DialogDescription>{conversationText.pointAtFilesHint}</DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex h-8 min-w-0 items-center gap-2">
          {at ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={conversationText.upOneFolder}
              title={conversationText.upOneFolder}
              onClick={() => setTrail(trail.slice(0, -1))}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
          ) : (
            <SpaceMark id={space.id} name={space.name} />
          )}
          <span className="truncate font-medium">{at?.name ?? space.name}</span>
        </div>

        <PickBox className="h-64">
          {inside.isPending ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : inside.isError ? (
            <p role="alert" className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
              {inside.error.code === 'NOT_FOUND' ? conversationText.folderGone : thrownText(inside.error)}
            </p>
          ) : inside.data.length === 0 ? (
            <p className="flex h-full items-center justify-center text-muted-foreground">
              {conversationText.folderEmpty}
            </p>
          ) : (
            <ul>
              {inside.data.map((file) => {
                const on = ticked.some((each) => each.id === file.id);
                const box = (
                  <Checkbox
                    id={`${idPrefix}-${file.id}`}
                    checked={on}
                    disabled={!on && full}
                    aria-label={file.kind === 'folder' ? conversationText.pickFolder(file.name) : undefined}
                    onCheckedChange={(next) => tick(file, next)}
                  />
                );
                return (
                  <PickRow key={file.id} render={<li />}>
                    {file.kind === 'folder' ? (
                      // A folder is ticked by its box, and walked into by its name
                      <>
                        {box}
                        <button
                          type="button"
                          onClick={() => setTrail([...trail, file])}
                          className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-full text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                        >
                          <FileIcon name={file.name} folder />
                          <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            strokeWidth={2}
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                        </button>
                      </>
                    ) : (
                      <label
                        htmlFor={`${idPrefix}-${file.id}`}
                        className="flex h-full min-w-0 flex-1 items-center gap-3"
                      >
                        {box}
                        <FileIcon name={file.name} />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      </label>
                    )}
                  </PickRow>
                );
              })}
            </ul>
          )}
        </PickBox>

        {/* One line under the list, kept whether it says something or not: the buttons below do not jump */}
        <p className="min-h-5 text-muted-foreground">
          {ticked.length > 0 && conversationText.picked(ticked.length, max)}
        </p>
      </div>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="secondary" />}>{conversationText.cancel}</DialogClose>
        <Button onClick={() => onDone([...ticked])}>{conversationText.pointAtFilesConfirm}</Button>
      </DialogFooter>
    </>
  );
}
