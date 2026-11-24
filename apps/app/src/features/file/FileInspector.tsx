import { Delete02Icon, Download04Icon, FolderTransferIcon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { KeyMark } from '@/components/KeyMark';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { FieldError } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { membersQuery } from '@/features/space/members';
import { SpaceMark } from '@/features/space/SpaceMark';
import { spaceHolds, spaceSizeQuery } from '@/features/space/spaces';
import { shareOf } from '@/features/space/storageLimit';
import { spaceText } from '@/features/space/text';
import { useIsMobile } from '@/hooks/useIsMobile';
import { thrownText } from '@/lib/api';
import { formatMoment, formatSize, formatWhen } from '@/lib/format';
import { downloadFile } from './download';
import type { FileAction } from './FileDialogs';
import { FileIcon } from './FileIcon';
import { FilePreview } from './FilePreview';
import { FilesLink } from './FilesLink';
import { placeOf } from './fileOrder';
import { type DriveFile, folderQuery } from './files';
import { fileText } from './text';
import { type FileVersion, restoreVersion, versionsQuery } from './versions';
import { WrittenBy } from './WrittenBy';

// The pane that shows what was picked, wherever it was picked: next to the columns of folders, next to what a
// search found, next to a conversation that points at a file. A file shows a preview, what is known about it and
// every content it has had; a folder what it holds; and with nothing picked, the space itself.
// Anyone in the space downloads a file, as it is now or as it was. An editor makes an old version its content
// again; what else an editor does to it (onAct) is offered where the place that shows the pane does it.

/**
 * The pane. file is what was picked, or null for the space itself. onAct is told what an editor picked to do to
 * it; left out, those buttons are not there. locate is for a place that shows it away from where it is (next to
 * what a search found, next to a conversation): the pane then has the way to it among the files.
 */
export function FileInspector({
  file,
  onAct,
  locate = false
}: {
  file: DriveFile | null;
  onAct?: (file: DriveFile, what: FileAction) => void;
  locate?: boolean;
}) {
  return (
    // The pane of another file is another pane: it begins at its top, with nothing of the one before in it
    <ScrollArea key={file?.id} className="min-h-0 flex-1">
      <div className="flex flex-col gap-5 p-5">
        {file === null ? (
          <SpaceDetails />
        ) : file.kind === 'folder' ? (
          <FolderDetails folder={file} onAct={onAct} locate={locate} />
        ) : (
          <FileDetails file={file} onAct={onAct} locate={locate} />
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * The way to where a file or a folder is among the files. On a phone a picked file is shown over its folder, so
 * there the folder itself is what shows where the file is.
 */
function Locate({ file }: { file: DriveFile }) {
  const space = useCurrentSpace();
  const isMobile = useIsMobile();
  const fileId = isMobile && file.kind === 'file' ? file.parentId : file.id;
  return (
    <Button
      variant="secondary"
      size="sm"
      nativeButton={false}
      render={<FilesLink spaceId={space.id} fileId={fileId} />}
    >
      {fileText.showInFolder}
    </Button>
  );
}

/** What is known of something, a line each: what it is, then its value */
function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="col-span-2 min-w-0 break-words">{children}</dd>
    </>
  );
}

/** What it is: its icon and its name, how it is described, and the way to describe it when there is one */
function Heading({ file, onDescribe }: { file: DriveFile; onDescribe?: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <FileIcon name={file.name} folder={file.kind === 'folder'} className="size-7" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 className="text-xl leading-7 font-semibold break-words">{file.name}</h2>
        {file.description && (
          <p className="text-sm break-words whitespace-pre-line text-muted-foreground select-text">
            {file.description}
          </p>
        )}
        {onDescribe && (
          <div>
            <Button variant="link" size="sm" className="h-auto px-0" onClick={onDescribe}>
              {file.description ? fileText.editDescription : fileText.addDescription}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** What an editor does to a file or a folder, as buttons */
function EditButtons({ file, onAct }: { file: DriveFile; onAct: (file: DriveFile, what: FileAction) => void }) {
  return (
    <ButtonGroup>
      <Button variant="secondary" size="sm" onClick={() => onAct(file, 'rename')}>
        <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} data-icon="inline-start" />
        {fileText.rename}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => onAct(file, 'move')}>
        <HugeiconsIcon icon={FolderTransferIcon} strokeWidth={2} data-icon="inline-start" />
        {fileText.move}
      </Button>
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={fileText.toTrash}
        title={fileText.toTrash}
        onClick={() => onAct(file, 'trash')}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
      </Button>
    </ButtonGroup>
  );
}

/** Where something is: the space, and the folders down to the one it is in */
function Where({ file }: { file: DriveFile }) {
  const space = useCurrentSpace();
  const place = placeOf(file.path);
  return place === null ? space.name : `${space.name} / ${place}`;
}

/** When something last changed: how long ago, and the moment itself for whoever points at it */
function When({ time }: { time: string }) {
  return <span title={formatMoment(time)}>{formatWhen(time)}</span>;
}

// ---------------------------------------------------------------------------------------------------------------

function FileDetails({
  file,
  onAct,
  locate
}: {
  file: DriveFile;
  onAct?: (file: DriveFile, what: FileAction) => void;
  locate: boolean;
}) {
  const space = useCurrentSpace();
  return (
    <>
      <FilePreview file={file} />
      <Heading file={file} onDescribe={onAct && (() => onAct(file, 'describe'))} />

      <div className="flex flex-wrap gap-2">
        {/* The main thing to do takes the room the others leave, or a line of its own where there is none */}
        <Button size="sm" className="flex-1" onClick={() => downloadFile(space.id, file)}>
          <HugeiconsIcon icon={Download04Icon} strokeWidth={2} data-icon="inline-start" />
          {fileText.downloadFile}
        </Button>
        {locate && <Locate file={file} />}
        {onAct && <EditButtons file={file} onAct={onAct} />}
      </div>

      <Separator />

      <Facts>
        {file.version && <Fact label={fileText.size}>{formatSize(file.version.size)}</Fact>}
        <Fact label={fileText.modified}>
          <When time={file.updatedAt} />
        </Fact>
        {file.version && (
          <Fact label={fileText.writtenBy}>
            <WrittenBy version={file.version} />
          </Fact>
        )}
        <Fact label={fileText.where}>
          <Where file={file} />
        </Fact>
      </Facts>

      <Separator />

      <Versions file={file} />
    </>
  );
}

/** Every content the file has had, the latest first: each can be downloaded, and an editor restores an old one */
function Versions({ file }: { file: DriveFile }) {
  const space = useCurrentSpace();
  const versions = useInfiniteQuery(versionsQuery(space.id, file.id));
  // The version being restored: the buttons that restore are off until the api has answered
  const [restoring, setRestoring] = useState<string | null>(null);
  const canEdit = roleCovers(space.role, 'editor');
  const list = versions.data?.pages.flatMap((page) => page.versions);

  const restore = async (version: FileVersion) => {
    if (restoring !== null) return;
    setRestoring(version.id);
    await restoreVersion(space.id, file, version);
    setRestoring(null);
  };

  return (
    <section aria-labelledby="versions-title" className="flex flex-col gap-3">
      <h3 id="versions-title" className="text-sm font-medium">
        {fileText.versionsTitle}
      </h3>
      <p className="text-sm text-pretty text-muted-foreground">
        {canEdit ? fileText.versionsHintEditor : fileText.versionsHint}
      </p>
      {list === undefined ? (
        versions.isError ? (
          <FieldError>{thrownText(versions.error)}</FieldError>
        ) : (
          <Spinner />
        )
      ) : (
        <ItemGroup>
          {list.map((version) => {
            const when = formatMoment(version.createdAt);
            const isCurrent = version.id === file.version?.id;
            return (
              <Item key={version.id} size="xs" variant="muted">
                <ItemMedia>
                  {version.apiKey ? (
                    <KeyMark size="sm" />
                  ) : (
                    <PersonAvatar id={version.user.id} name={version.user.name} size="sm" />
                  )}
                </ItemMedia>
                <ItemContent>
                  {/* How long ago, which the pane has room for; the moment itself is said when it is pointed at */}
                  <ItemTitle title={when}>
                    {formatWhen(version.createdAt)}
                    {isCurrent && <Badge>{fileText.current}</Badge>}
                  </ItemTitle>
                  <ItemDescription
                    title={version.apiKey ? fileText.viaKey(version.user.name, version.apiKey.name) : undefined}
                  >
                    {version.apiKey && <>{version.apiKey.name} · </>}
                    {version.user.name} · {formatSize(version.size)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {canEdit && !isCurrent && (
                    <Button
                      variant="secondary"
                      size="xs"
                      aria-label={fileText.restoreVersion(when)}
                      disabled={restoring !== null}
                      onClick={() => restore(version)}
                    >
                      {restoring === version.id && <Spinner data-icon="inline-start" />}
                      {fileText.restoreShort}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={fileText.downloadVersion(when)}
                    title={fileText.downloadVersion(when)}
                    onClick={() => downloadFile(space.id, file, version.id)}
                  >
                    <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      {versions.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={versions.isFetchingNextPage}
            onClick={() => versions.fetchNextPage()}
          >
            {versions.isFetchingNextPage && <Spinner data-icon="inline-start" />}
            {fileText.showMore}
          </Button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** How many folders and files a folder holds (null: the space itself), once that is known */
function Holds({ folderId }: { folderId: string | null }) {
  const space = useCurrentSpace();
  const inside = useQuery(folderQuery(space.id, folderId));
  if (!inside.data) return inside.isError ? null : <Skeleton className="h-5 w-24" />;
  const folders = inside.data.filter((each) => each.kind === 'folder').length;
  return fileText.summary(folders, inside.data.length - folders) || fileText.nothingInside;
}

function FolderDetails({
  folder,
  onAct,
  locate
}: {
  folder: DriveFile;
  onAct?: (file: DriveFile, what: FileAction) => void;
  locate: boolean;
}) {
  return (
    <>
      <Heading file={folder} onDescribe={onAct && (() => onAct(folder, 'describe'))} />

      {(onAct || locate) && (
        <div className="flex flex-wrap gap-2">
          {locate && <Locate file={folder} />}
          {onAct && <EditButtons file={folder} onAct={onAct} />}
        </div>
      )}

      <Separator />

      <Facts>
        <Fact label={fileText.holds}>
          <Holds folderId={folder.id} />
        </Fact>
        <Fact label={fileText.modified}>
          <When time={folder.updatedAt} />
        </Fact>
        <Fact label={fileText.where}>
          <Where file={folder} />
        </Fact>
      </Facts>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

/** With nothing picked: the space itself, what is directly in it, who is in it and how much it holds */
function SpaceDetails() {
  const space = useCurrentSpace();
  const members = useQuery(membersQuery(space.id));
  const size = useQuery(spaceSizeQuery(space.id));

  return (
    <>
      <div className="flex items-start gap-3">
        <SpaceMark id={space.id} name={space.name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="text-xl leading-9 font-semibold break-words">{space.name}</h2>
          <p className="text-sm text-muted-foreground">{fileText.pickHint}</p>
        </div>
      </div>

      <Separator />

      <Facts>
        <Fact label={fileText.holds}>
          <Holds folderId={null} />
        </Fact>
        <Fact label={shellText.members}>
          {members.data ? members.data.members.length : !members.isError && <Skeleton className="h-5 w-8" />}
        </Fact>
      </Facts>

      {size.data && (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{spaceText.storageTitle}</h3>
            {size.data.storageLimit !== null && (
              // The sentence under it says the same in words, so the bar is for the eye alone
              <Progress aria-hidden="true" value={shareOf(size.data.storageSize, size.data.storageLimit)} />
            )}
            <p className="text-sm text-muted-foreground">{spaceHolds(size.data)}</p>
          </section>
        </>
      )}
    </>
  );
}
