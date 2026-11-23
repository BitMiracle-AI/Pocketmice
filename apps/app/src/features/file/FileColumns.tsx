import { ArrowRight01Icon, FolderOpenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { useEffect, useRef } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useUploads } from '@/features/upload/uploads';
import { thrownText } from '@/lib/api';
import { downloadFile } from './download';
import type { FileAction } from './FileDialogs';
import { FileIcon } from './FileIcon';
import { FilesLink } from './FilesLink';
import { type DriveFile, folderQuery } from './files';
import { fileText } from './text';

// The files of a space as columns: the space itself is the first, and every folder on the way down to what is
// picked is a column to the right of the one it is in. A row that is picked is shown in the pane on the right;
// a folder that is picked opens as the next column too.

/**
 * A folder that is open as a column. id is null for the space itself, and undefined while the api has not yet
 * said which folder the name on the way stands for.
 */
export interface OpenFolder {
  /** What tells it from the other columns, whatever is known of it: its path */
  key: string;
  id: string | null | undefined;
  name: string;
}

/**
 * The columns. open is the folders that are open, the space first; picked is what the address says is picked.
 * onAct is told what an editor picked from the menu of a row; left out, a row only offers what a viewer may do.
 */
export function FileColumns({
  open,
  picked,
  onAct
}: {
  open: OpenFolder[];
  picked: DriveFile | null;
  onAct?: (file: DriveFile, what: FileAction) => void;
}) {
  const scroller = useRef<HTMLElement>(null);
  const deepest = open[open.length - 1]?.key;
  // The column that was opened last is the one in view: the ones before it are a scroll back
  // biome-ignore lint/correctness/useExhaustiveDependencies: it follows which folder is open last, and reads nothing of it
  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollTo({ left: element.scrollWidth, behavior: 'smooth' });
  }, [deepest]);

  return (
    <nav ref={scroller} aria-label={fileText.browse} className="flex min-w-0 flex-1 overflow-x-auto">
      {open.map((folder, index) => {
        const last = index === open.length - 1;
        return (
          <Column
            key={folder.key}
            folder={folder}
            // The row of this column that is on the way to what is picked, or is it
            activeId={last ? (picked?.kind === 'file' ? picked.id : null) : (open[index + 1]?.id ?? null)}
            // On a phone one folder is shown at a time, as wide as the page: the last one
            className={last ? 'flex' : 'hidden md:flex'}
            onAct={onAct}
          />
        );
      })}
    </nav>
  );
}

function Column({
  folder,
  activeId,
  className,
  onAct
}: {
  folder: OpenFolder;
  activeId: string | null;
  className: string;
  onAct?: (file: DriveFile, what: FileAction) => void;
}) {
  const space = useCurrentSpace();
  const inside = useQuery({ ...folderQuery(space.id, folder.id ?? null), enabled: folder.id !== undefined });
  const uploads = useUploads();
  const files = inside.data;
  // What is on its way into this folder and has no row yet: a new version of a file goes up under its row
  const arriving = files
    ? uploads.filter(
        (upload) =>
          upload.spaceId === space.id &&
          upload.parentId === folder.id &&
          (upload.state === 'waiting' || upload.state === 'sending') &&
          !files.some((file) => file.name === upload.name)
      )
    : [];

  return (
    // A column is as wide as the room allows, between a least and a most: more of them than fit are scrolled to
    <div className={cn('w-full shrink-0 flex-col border-r md:max-w-80 md:min-w-56 md:flex-1', className)}>
      {files === undefined ? (
        <Empty>
          <EmptyHeader>
            {inside.isError ? (
              <EmptyDescription role="alert">{thrownText(inside.error)}</EmptyDescription>
            ) : (
              <Spinner />
            )}
          </EmptyHeader>
        </Empty>
      ) : files.length === 0 && arriving.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{folder.id === null ? fileText.emptySpace : fileText.emptyFolder}</EmptyTitle>
            <EmptyDescription>{onAct ? fileText.emptyHint : fileText.emptyHintViewer}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <SidebarGroup>
            <SidebarMenu aria-label={folder.name}>
              {files.map((file) => (
                <Row key={file.id} file={file} active={file.id === activeId} onAct={onAct} />
              ))}
              {arriving.map((upload) => (
                <SidebarMenuItem key={upload.id}>
                  <SidebarMenuButton disabled>
                    <Spinner />
                    <span>{upload.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </ScrollArea>
      )}
    </div>
  );
}

/**
 * One file or folder in a column. Picking it shows it on the right, and a folder opens as the next column. Its
 * menu (a right click, or a long press) is what can be done with it from here: a file is downloaded by anyone who
 * sees it, and an editor renames it, describes it, moves it and puts it in the trash.
 */
function Row({
  file,
  active,
  onAct
}: {
  file: DriveFile;
  active: boolean;
  onAct?: (file: DriveFile, what: FileAction) => void;
}) {
  const space = useCurrentSpace();
  const isFolder = file.kind === 'folder';
  const button = (
    <SidebarMenuButton render={<FilesLink spaceId={space.id} fileId={file.id} />} isActive={active} title={file.name}>
      <FileIcon name={file.name} folder={isFolder} />
      <span>{file.name}</span>
      {isFolder && <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="ml-auto text-muted-foreground" />}
    </SidebarMenuButton>
  );
  if (isFolder && !onAct) return <SidebarMenuItem>{button}</SidebarMenuItem>;

  return (
    <SidebarMenuItem>
      <ContextMenu>
        <ContextMenuTrigger render={button} />
        <ContextMenuContent className="min-w-44">
          {!isFolder && (
            <ContextMenuItem onClick={() => downloadFile(space.id, file)}>{fileText.downloadFile}</ContextMenuItem>
          )}
          {onAct && (
            <>
              <ContextMenuItem onClick={() => onAct(file, 'rename')}>{fileText.rename}</ContextMenuItem>
              <ContextMenuItem onClick={() => onAct(file, 'describe')}>
                {file.description ? fileText.editDescription : fileText.addDescription}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onAct(file, 'move')}>{fileText.move}</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={() => onAct(file, 'trash')}>
                {fileText.toTrash}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  );
}
