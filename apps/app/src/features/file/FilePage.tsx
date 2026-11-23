import { ArrowTurnBackwardIcon, Download04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { Page, PageHead } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { MainBar } from '@/features/shell/MainBar';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { formatMoment, formatSize } from '@/lib/format';
import { downloadFile } from './download';
import { FileDialogs, useFileActions } from './FileDialogs';
import { FileIcon } from './FileIcon';
import { FileMenu } from './FileMenu';
import type { DriveFile } from './files';
import { HEAD, ROW, ROW_BUTTON } from './listLayout';
import { fileText } from './text';
import { useTrail } from './useTrail';
import { type FileVersion, restoreVersion, versionsQuery } from './versions';
import { WrittenBy } from './WrittenBy';

// The page of one file: what it is, and every content it has had. Anyone in the space downloads it, as it is now
// or as it was; an editor does to it what the menu of its row does, and makes an old version its content again.

/**
 * The columns of the list of versions: when it was written, who wrote it, how large it is, and what can be done
 * with it. They go by the width of the list. A list that is narrow drops how large first, then who: when a
 * version was written is what tells it from the others.
 */
const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_3.625rem] items-center gap-x-5 px-3 @md:grid-cols-[16.5rem_minmax(0,1fr)_3.625rem] @2xl:grid-cols-[16.5rem_minmax(0,1fr)_4.5rem_3.625rem]';
const WHO = 'hidden min-w-0 @md:flex';
const SIZE = 'hidden text-right @2xl:block';

/** The page of the file file. Its route has made sure there is such a file, and that it is no folder */
export function FilePage({ file }: { file: DriveFile }) {
  const space = useCurrentSpace();
  const navigate = useNavigate();
  const trail = useTrail(space, file);
  const versions = useSuspenseInfiniteQuery(versionsQuery(space.id, file.id));
  // The version being restored: the buttons that restore are off until the api has answered
  const [restoring, setRestoring] = useState<string | null>(null);
  // Once the file is in the trash this page has nothing to show: the person is taken to the folder it was in
  const actions = useFileActions(space.id, () =>
    navigate(
      file.parentId
        ? { to: '/spaces/$spaceId/files/$fileId', params: { spaceId: space.id, fileId: file.parentId } }
        : { to: '/spaces/$spaceId', params: { spaceId: space.id } }
    )
  );

  const canEdit = roleCovers(space.role, 'editor');
  const list = versions.data.pages.flatMap((page) => page.versions);

  const restore = async (version: FileVersion) => {
    if (restoring !== null) return;
    setRestoring(version.id);
    await restoreVersion(space.id, file, version);
    setRestoring(null);
  };

  return (
    <>
      <MainBar trail={trail} title={file.name} />

      <Page wide>
        <PageHead
          title={file.name}
          mark={<FileIcon name={file.name} folder={false} className="size-5" />}
          hint={file.description || undefined}
        >
          <Button onClick={() => downloadFile(space.id, file)}>
            <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" />
            {fileText.downloadFile}
          </Button>
          {canEdit && (
            <FileMenu file={file} onPick={(what) => actions.pick(file, what)} className="text-muted-foreground" />
          )}
        </PageHead>

        <section aria-labelledby="versions-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="versions-title" className="font-heading text-sm font-medium">
              {fileText.versionsTitle}
            </h2>
            <p className="max-w-xl text-sm text-pretty text-muted-foreground">
              {canEdit ? fileText.versionsHintEditor : fileText.versionsHint}
            </p>
          </div>

          <div className="@container -mx-3">
            <div className={cn(COLUMNS, HEAD)}>
              <span>{fileText.versionWritten}</span>
              <span className={WHO}>{fileText.versionBy}</span>
              <span className={SIZE}>{fileText.size}</span>
              <span />
            </div>
            <ul className="pt-1.5">
              {list.map((version) => {
                const when = formatMoment(version.createdAt);
                const isCurrent = version.id === file.version?.id;
                return (
                  <li key={version.id} className={cn(COLUMNS, ROW)}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="truncate tabular-nums">{when}</span>
                      {isCurrent && <Badge variant="secondary">{fileText.current}</Badge>}
                    </div>
                    <div className={cn(WHO, 'text-muted-foreground')}>
                      <WrittenBy version={version} />
                    </div>
                    <span className={cn(SIZE, 'text-muted-foreground tabular-nums')}>{formatSize(version.size)}</span>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={fileText.downloadVersion(when)}
                        title={fileText.downloadVersion(when)}
                        onClick={() => downloadFile(space.id, file, version.id)}
                        className={ROW_BUTTON}
                      >
                        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                      </Button>
                      {canEdit && !isCurrent && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={fileText.restoreVersion(when)}
                          title={fileText.restoreVersion(when)}
                          disabled={restoring !== null}
                          onClick={() => restore(version)}
                          className={ROW_BUTTON}
                        >
                          {restoring === version.id ? (
                            <Spinner />
                          ) : (
                            <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} />
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {versions.hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  disabled={versions.isFetchingNextPage}
                  onClick={() => versions.fetchNextPage()}
                >
                  {versions.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                  {fileText.showMore}
                </Button>
              </div>
            )}
          </div>
        </section>
      </Page>

      <FileDialogs {...actions.dialogs} />
    </>
  );
}
