import { FolderAddIcon, FolderOpenIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { useSuspenseQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { Page, PageHead } from '@/components/Page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { uploadFiles } from '@/features/upload/uploads';
import { FileDialogs, useFileActions } from './FileDialogs';
import { FileRow } from './FileRow';
import { type DriveFile, folderQuery } from './files';
import { COLUMNS, HEAD, MEDIUM, SIZE, WIDE } from './listLayout';
import { NewFolderDialog } from './NewFolderDialog';
import { fileText } from './text';
import { useTrail } from './useTrail';
import { WrittenBy } from './WrittenBy';

// What is in a folder of a space, or directly in the space: the way up, what an editor can do there, and the list.
// The list has no lines between its rows and one line of type per row: the description of a file follows its name
// on the same line, in grey, and is cut where the room ends.
// A row is what it is wherever files are listed (FileRow): here its wide column says who wrote the file last.

/** The page of what is directly in the space */
export function SpaceFilesPage() {
  return <FilesView folder={null} />;
}

/** The page of the folder folder. Its route has made sure there is such a folder */
export function FolderPage({ folder }: { folder: DriveFile }) {
  return <FilesView folder={folder} />;
}

function FilesView({ folder }: { folder: DriveFile | null }) {
  const space = useCurrentSpace();
  const folderId = folder?.id ?? null;
  const { data: files } = useSuspenseQuery(folderQuery(space.id, folderId));
  const trail = useTrail(space, folder);
  const picker = useRef<HTMLInputElement>(null);
  const [naming, setNaming] = useState(false);
  const actions = useFileActions(space.id);

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
                  wide={file.version && <WrittenBy version={file.version} />}
                  onPick={canEdit ? (what) => actions.pick(file, what) : undefined}
                />
              ))}
            </ul>
          </div>
        )}
      </Page>

      <NewFolderDialog spaceId={space.id} parentId={folderId} open={naming} onOpenChange={setNaming} />
      <FileDialogs {...actions.dialogs} />
    </>
  );
}
