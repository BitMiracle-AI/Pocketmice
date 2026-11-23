import { Delete02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Page } from '@/components/Page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { PageBar } from '@/features/shell/PageBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useLastGiven } from '@/hooks/useLastGiven';
import { formatSize, formatWhen } from '@/lib/format';
import { FileIcon } from './FileIcon';
import { useGoToFiles } from './FilesLink';
import { placeOf } from './fileOrder';
import { fileText } from './text';
import { deleteForGood, emptyTheTrash, putBack, type TrashedFile, trashQuery } from './trash';

// The trash of a space: what was deleted from it, the latest first. Anyone in the space sees it. An editor puts
// something back where it was; the owner alone deletes it for good, one thing or everything, and is asked first:
// that is the one thing here nothing undoes.

/** What the owner is being asked about: deleting one thing for good, or everything */
type Asking = { file: TrashedFile } | 'everything' | null;

export function TrashPage() {
  const space = useCurrentSpace();
  const goTo = useGoToFiles(space.id);
  const trash = useSuspenseInfiniteQuery(trashQuery(space.id));
  const files = trash.data.pages.flatMap((page) => page.files);
  // The rows something is being done to: their buttons are off until the api has answered
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = useState<Asking>(null);
  const [deleting, setDeleting] = useState(false);
  const asked = useLastGiven(asking);

  const canEdit = roleCovers(space.role, 'editor');
  const isOwner = space.role === 'owner';

  const mark = (fileId: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(fileId);
      else next.delete(fileId);
      return next;
    });

  const restore = async (file: TrashedFile) => {
    mark(file.id, true);
    const back = await putBack(space.id, file.id);
    mark(file.id, false);
    if (!back) return;
    toast.add({
      title: fileText.restored(back.name),
      actionProps: {
        children: fileText.show,
        // Where it is again: picked, in the folder it was put back into
        onClick: () => void goTo(back.id)
      }
    });
  };

  const confirm = async () => {
    if (!asking || deleting) return;
    setDeleting(true);
    const problem =
      asking === 'everything' ? await emptyTheTrash(space.id) : await deleteForGood(space.id, asking.file.id);
    setDeleting(false);
    setAsking(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <>
      <PageBar
        title={shellText.trash}
        actions={
          isOwner &&
          files.length > 0 && (
            <Button variant="destructive" onClick={() => setAsking('everything')}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
              {fileText.emptyTrash}
            </Button>
          )
        }
      />

      {files.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{fileText.trashEmptyTitle}</EmptyTitle>
            <EmptyDescription>{fileText.trashEmptyHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Page wide>
          <p className="text-sm text-muted-foreground">{fileText.trashHints[space.role]}</p>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{fileText.name}</TableHead>
                  <TableHead className="hidden lg:table-cell">{fileText.wasIn}</TableHead>
                  <TableHead className="hidden sm:table-cell">{fileText.deleted}</TableHead>
                  <TableHead className="hidden text-right md:table-cell">{fileText.size}</TableHead>
                  {canEdit && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => (
                  <TableRow key={file.id}>
                    <TableCell className="max-w-0 w-full">
                      <div className="flex items-center gap-3">
                        <FileIcon name={file.name} folder={file.kind === 'folder'} className="size-4" />
                        <span className="truncate font-medium" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {placeOf(file.path) ?? space.name}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatWhen(file.trashedAt)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                      {file.version && formatSize(file.version.size)}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={fileText.restore(file.name)}
                            disabled={busy.has(file.id)}
                            onClick={() => restore(file)}
                          >
                            {fileText.putBack}
                          </Button>
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={fileText.deleteForGood(file.name)}
                              title={fileText.deleteForGood(file.name)}
                              disabled={busy.has(file.id)}
                              onClick={() => setAsking({ file })}
                            >
                              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {trash.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" disabled={trash.isFetchingNextPage} onClick={() => trash.fetchNextPage()}>
                {trash.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                {fileText.showMore}
              </Button>
            </div>
          )}
        </Page>
      )}

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && !deleting && setAsking(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {asked === 'everything' ? fileText.emptyTrashTitle : asked && fileText.deleteTitle(asked.file.name)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {asked === 'everything'
                ? fileText.emptyTrashHint
                : asked?.file.kind === 'folder'
                  ? fileText.deleteFolderHint
                  : fileText.deleteFileHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{fileText.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirm}>
              {deleting && <Spinner data-icon="inline-start" />}
              {asked === 'everything' ? fileText.emptyTrash : fileText.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
