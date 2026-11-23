import { Download04Icon, FolderAddIcon, FolderOpenIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { getFile, getFileByPath } from '@pocketmice/contract/domains/file';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { useQueries, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { KeyMark } from '@/components/KeyMark';
import { Page, PageHead } from '@/components/Page';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MainBar, type TrailStep } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import type { Space } from '@/features/space/spaces';
import { uploadFiles } from '@/features/upload/uploads';
import { readQuery } from '@/lib/api';
import { formatSize, formatWhen } from '@/lib/format';
import { DescriptionDialog } from './DescriptionDialog';
import { downloadFile } from './download';
import { FileIcon } from './FileIcon';
import { type FileAction, FileMenu } from './FileMenu';
import { foldersAbove } from './fileOrder';
import { type DriveFile, folderQuery } from './files';
import { COLUMNS, HEAD, MEDIUM, ROW, ROW_BUTTON, SIZE, WIDE } from './listLayout';
import { MoveDialog } from './MoveDialog';
import { NewFolderDialog } from './NewFolderDialog';
import { RenameDialog } from './RenameDialog';
import { fileText } from './text';
import { moveToTrash } from './trash';

// What is in a folder of a space, or directly in the space: the way up, what an editor can do there, and the list.
// The list has no lines between its rows and one line of type per row: the description of a file follows its name
// on the same line, in grey, and is cut where the room ends.
// A row ends with what can be done with it: a file can be downloaded by anyone who sees it, and an editor has a
// menu that renames it, describes it, moves it and puts it in the trash.

/** What is being done to one file of the list in a dialog: the dialog of that is open */
type Acting = { file: DriveFile; what: Exclude<FileAction, 'trash'> } | null;

/** The page of what is directly in the space */
export function SpaceFilesPage() {
  return <FilesView folder={null} />;
}

/** The page of the folder folderId. Its route has made sure there is such a folder */
export function FolderPage({ folderId }: { folderId: string }) {
  const space = useCurrentSpace();
  const { data } = useSuspenseQuery(readQuery(getFile, { spaceId: space.id, fileId: folderId }));
  return <FilesView folder={data.file} />;
}

/**
 * The way from the files of the space down to a folder, for the bar at the top: the folders above it, each a link
 * once its address is known. The names come from the path of the folder, which is there at once. The address of
 * the folder right above it is in the folder itself; the ones further up are asked for by their paths, and are
 * plain names until the answers are there.
 */
function useTrail(space: Space, folder: DriveFile | null): TrailStep[] {
  const above = folder ? foldersAbove(folder.path) : [];
  const further = above.slice(0, -1);
  const found = useQueries({
    queries: further.map(({ path }) => readQuery(getFileByPath, { spaceId: space.id, path }))
  });
  if (!folder) return [];

  const linkTo = (fileId: string | null | undefined) =>
    fileId ? <Link to="/spaces/$spaceId/files/$fileId" params={{ spaceId: space.id, fileId }} /> : undefined;
  return [
    { label: shellText.files, link: <Link to="/spaces/$spaceId" params={{ spaceId: space.id }} /> },
    ...above.map(({ name }, index) => ({
      label: name,
      link: linkTo(index === above.length - 1 ? folder.parentId : found[index]?.data?.file.id)
    }))
  ];
}

function FilesView({ folder }: { folder: DriveFile | null }) {
  const space = useCurrentSpace();
  const folderId = folder?.id ?? null;
  const { data: files } = useSuspenseQuery(folderQuery(space.id, folderId));
  const trail = useTrail(space, folder);
  const picker = useRef<HTMLInputElement>(null);
  const [naming, setNaming] = useState(false);
  const [acting, setActing] = useState<Acting>(null);

  const canEdit = roleCovers(space.role, 'editor');
  const folders = files.filter((file) => file.kind === 'folder').length;

  return (
    <>
      <MainBar trail={trail} title={folder?.name ?? shellText.files} />

      <Page wide>
        <PageHead
          title={folder?.name ?? space.name}
          hint={folder?.description || fileText.summary(folders, files.length - folders) || undefined}
          tag={
            !canEdit && (
              <Tooltip>
                <TooltipTrigger render={<Badge variant="secondary" />}>{fileText.viewOnly}</TooltipTrigger>
                <TooltipContent className="max-w-64">{fileText.viewOnlyHint}</TooltipContent>
              </Tooltip>
            )
          }
        >
          {canEdit && (
            <>
              {/* On a narrow window the first button keeps its icon and drops its words, which stay as its name */}
              <Button variant="outline" aria-label={fileText.newFolder} onClick={() => setNaming(true)}>
                <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} data-icon="inline-start" />
                <span className="max-sm:hidden">{fileText.newFolder}</span>
              </Button>
              <Button onClick={() => picker.current?.click()}>
                <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} data-icon="inline-start" />
                {fileText.upload}
              </Button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  if (picked.length > 0) uploadFiles(space.id, folderId, picked);
                  // Emptied, so that picking the same file again is a change too
                  event.target.value = '';
                }}
              />
            </>
          )}
        </PageHead>

        {files.length === 0 ? (
          <Empty className="pb-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>{folder ? fileText.emptyFolder : fileText.emptySpace}</EmptyTitle>
              <EmptyDescription>{canEdit ? fileText.emptyHint : fileText.emptyHintViewer}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="@container -mx-3">
            <div className={cn(COLUMNS, HEAD)}>
              <span>{fileText.name}</span>
              <span className={WIDE}>{fileText.writtenBy}</span>
              <span className={MEDIUM}>{fileText.modified}</span>
              <span className={SIZE}>{fileText.size}</span>
              <span />
            </div>
            <ul className="pt-1.5">
              {files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  spaceId={space.id}
                  // Putting it in the trash takes no dialog: it can be undone, and the page says so
                  onPick={
                    canEdit
                      ? (what) => (what === 'trash' ? void moveToTrash(space.id, file) : setActing({ file, what }))
                      : undefined
                  }
                />
              ))}
            </ul>
          </div>
        )}
      </Page>

      <NewFolderDialog spaceId={space.id} parentId={folderId} open={naming} onOpenChange={setNaming} />
      <RenameDialog
        spaceId={space.id}
        file={acting?.what === 'rename' ? acting.file : null}
        onClose={() => setActing(null)}
      />
      <DescriptionDialog
        spaceId={space.id}
        file={acting?.what === 'describe' ? acting.file : null}
        onClose={() => setActing(null)}
      />
      <MoveDialog file={acting?.what === 'move' ? acting.file : null} from={folder} onClose={() => setActing(null)} />
    </>
  );
}

/** One row of the list. onPick is there for an editor: what was picked from the menu of the row */
function FileRow({
  file,
  spaceId,
  onPick
}: {
  file: DriveFile;
  spaceId: string;
  onPick: ((action: FileAction) => void) | undefined;
}) {
  const isFolder = file.kind === 'folder';
  return (
    <li className={cn(COLUMNS, ROW)}>
      <div className="flex min-w-0 items-center gap-3">
        <FileIcon name={file.name} folder={isFolder} className="size-4.5" />
        {isFolder ? (
          // The link is as large as the row: anywhere on the row opens the folder
          <Link
            to="/spaces/$spaceId/files/$fileId"
            params={{ spaceId, fileId: file.id }}
            className="min-w-0 truncate outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/30"
          >
            {file.name}
          </Link>
        ) : (
          <span className="min-w-0 truncate">{file.name}</span>
        )}
        {file.description && (
          <span className="hidden min-w-0 shrink-[9999] truncate text-muted-foreground @2xl:block">
            {file.description}
          </span>
        )}
      </div>

      <div className={cn(WIDE, 'text-muted-foreground')}>
        <WrittenBy file={file} />
      </div>
      <span className={cn(MEDIUM, 'text-muted-foreground tabular-nums')}>{formatWhen(file.updatedAt)}</span>
      <span className={cn(SIZE, 'text-muted-foreground tabular-nums')}>
        {file.version && formatSize(file.version.size)}
      </span>

      <div className="flex items-center justify-end gap-0.5">
        {!isFolder && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={fileText.download(file.name)}
            title={fileText.download(file.name)}
            onClick={() => downloadFile(spaceId, file)}
            className={ROW_BUTTON}
          >
            <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
          </Button>
        )}
        {onPick && <FileMenu file={file} onPick={onPick} className={ROW_BUTTON} />}
      </div>
    </li>
  );
}

/**
 * Who wrote the content a file has now: a person, or an agent. An agent is named by the API key it wrote through,
 * and the person it wrote as follows: that is the one thing in this list a plain drive does not have.
 * A folder has no content, and nothing here.
 */
function WrittenBy({ file }: { file: DriveFile }) {
  if (!file.version) return null;
  const { user, apiKey } = file.version;

  if (!apiKey) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <PersonAvatar name={user.name} small />
        <span className="truncate">{user.name}</span>
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="relative z-10 flex min-w-0 cursor-default items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        }
      >
        <KeyMark className="size-5" />
        <span className="truncate">
          <span className="text-foreground">{apiKey.name}</span>
          <span aria-hidden="true" className="px-1.5 text-muted-foreground/50">
            ·
          </span>
          {user.name}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{fileText.viaKey(user.name, apiKey.name)}</TooltipContent>
    </Tooltip>
  );
}
