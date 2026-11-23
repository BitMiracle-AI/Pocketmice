import { ArrowTurnBackwardIcon, Delete02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { Page, PageHead } from '@/components/Page';
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
import { toast } from '@/components/ui/toast';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useLastGiven } from '@/hooks/useLastGiven';
import { formatSize, formatWhen } from '@/lib/format';
import { FileIcon } from './FileIcon';
import { placeOf } from './fileOrder';
import { COLUMNS, HEAD, MEDIUM, ROW, ROW_BUTTON, SIZE, WIDE } from './listLayout';
import { fileText } from './text';
import { deleteForGood, emptyTheTrash, putBack, type TrashedFile, trashQuery } from './trash';

// The trash of a space: what was deleted from it, the latest first. Anyone in the space sees it. An editor puts
// something back where it was; the owner alone deletes it for good, one thing or everything, and is asked first:
// that is the one thing here nothing undoes.

/** What the owner is being asked about: deleting one thing for good, or everything */
type Asking = { file: TrashedFile } | 'everything' | null;

export function TrashPage() {
  const space = useCurrentSpace();
  const navigate = useNavigate();
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
        onClick: () =>
          void navigate(
            back.parentId
              ? { to: '/spaces/$spaceId/files/$fileId', params: { spaceId: space.id, fileId: back.parentId } }
              : { to: '/spaces/$spaceId', params: { spaceId: space.id } }
          )
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
      <MainBar trail={[]} title={shellText.trash} />

      <Page wide>
        <PageHead title={shellText.trash} hint={fileText.trashHints[space.role]}>
          {isOwner && files.length > 0 && (
            <Button variant="outline" onClick={() => setAsking('everything')}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
              {fileText.emptyTrash}
            </Button>
          )}
        </PageHead>

        {files.length === 0 ? (
          <Empty className="pb-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{fileText.trashEmptyTitle}</EmptyTitle>
              <EmptyDescription>{fileText.trashEmptyHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="@container -mx-3">
            <div className={cn(COLUMNS, HEAD)}>
              <span>{fileText.name}</span>
              <span className={WIDE}>{fileText.wasIn}</span>
              <span className={MEDIUM}>{fileText.deleted}</span>
              <span className={SIZE}>{fileText.size}</span>
              <span />
            </div>
            <ul className="pt-1.5">
              {files.map((file) => (
                <li key={file.id} className={cn(COLUMNS, ROW)}>
                  <div className="flex min-w-0 items-center gap-3">
                    <FileIcon name={file.name} folder={file.kind === 'folder'} className="size-4.5" />
                    <span className="min-w-0 truncate">{file.name}</span>
                  </div>
                  <span className={cn(WIDE, 'text-muted-foreground')}>
                    <span className="truncate">{placeOf(file.path) ?? space.name}</span>
                  </span>
                  <span className={cn(MEDIUM, 'text-muted-foreground tabular-nums')}>{formatWhen(file.trashedAt)}</span>
                  <span className={cn(SIZE, 'text-muted-foreground tabular-nums')}>
                    {file.version && formatSize(file.version.size)}
                  </span>
                  <div className="flex items-center justify-end gap-0.5">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={fileText.restore(file.name)}
                        title={fileText.restore(file.name)}
                        disabled={busy.has(file.id)}
                        onClick={() => restore(file)}
                        className={ROW_BUTTON}
                      >
                        <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} />
                      </Button>
                    )}
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={fileText.deleteForGood(file.name)}
                        title={fileText.deleteForGood(file.name)}
                        disabled={busy.has(file.id)}
                        onClick={() => setAsking({ file })}
                        className={ROW_BUTTON}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {trash.hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" disabled={trash.isFetchingNextPage} onClick={() => trash.fetchNextPage()}>
                  {trash.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                  {fileText.showMore}
                </Button>
              </div>
            )}
          </div>
        )}
      </Page>

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
