import { ArrowLeft01Icon, FolderAddIcon, InformationCircleIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { getFile, getFileByPath } from '@pocketmice/contract/domains/file';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import { useQueries, useSuspenseQueries } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageBar } from '@/features/shell/PageBar';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { uploadFiles } from '@/features/upload/uploads';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useLastGiven } from '@/hooks/useLastGiven';
import { readQuery } from '@/lib/api';
import { FileColumns, type OpenFolder } from './FileColumns';
import { FileDialogs, useFileActions } from './FileDialogs';
import { FileGonePage } from './FileGonePage';
import { FileInspector } from './FileInspector';
import { FileResults } from './FileResults';
import { FileSearchField } from './FileSearchField';
import { FilesLink, useGoToFiles } from './FilesLink';
import { FilesTrail } from './FilesTrail';
import { foldersAbove, foldersToFind } from './fileOrder';
import type { DriveFile } from './files';
import { NewFolderDialog } from './NewFolderDialog';
import { fileText } from './text';

// The files of a space, on one page. Left of the page are the folders, a column each: the space itself, then every
// folder on the way down to what is picked. Right of them is what is picked, a file or a folder: what it is, what
// it holds, every content it has had (FileInspector). Words typed into the field of the bar put what they find
// in place of the columns, and the pane on the right stays.
// What is picked and what is looked for are both in the address, and nowhere else: /spaces/<space>/files has
// nothing picked, /spaces/<space>/files/<id> picks a file or a folder (one address for both, since they are the
// same kind of thing with the same kind of id), and ?q= are the words.
// A phone has room for one column: the folder that is open last. A file that is picked comes up over it.

/**
 * The page. fileId is what the address says is picked, or null when it says nothing; words is what it says is
 * looked for, empty when it says nothing.
 * Its route has made sure there is such a file. One that has gone since (into the trash, or for good; by the
 * person a page ago, or by someone else while this page is open) is still in the cache as it was, next to the
 * answer that it is not there: the page goes by that answer, as the route does for an address with nothing at it.
 */
export function FilesPage({ fileId, words }: { fileId: string | null; words: string }) {
  const space = useCurrentSpace();
  // What is picked is read here, one file or none, and not in a component of its own around the page: the page
  // is the same page with something picked and with nothing, and stays as it is from the one to the other
  const found = useSuspenseQueries({
    queries: (fileId === null ? [] : [fileId]).map((id) => readQuery(getFile, { spaceId: space.id, fileId: id }))
  }).at(0);
  if (found?.error?.code === 'NOT_FOUND') return <FileGonePage />;
  return <Files picked={found?.data.file ?? null} words={words} />;
}

/**
 * The folders that are open as columns when picked is what is picked: the space, the folders above it, and itself
 * when it is a folder.
 * The names come from the path of what is picked, which is there at once. The address of the folder right above
 * is in the file itself; the ones further up are asked for by their paths, and are not known until the answers
 * are there (the route has asked before the page is shown, so that is after something changed in the space):
 * their columns wait until then.
 */
function useOpenFolders(picked: DriveFile | null): OpenFolder[] {
  const space = useCurrentSpace();
  const above = picked ? foldersAbove(picked.path) : [];
  const found = useQueries({
    queries: (picked ? foldersToFind(picked.path) : []).map(({ path }) =>
      readQuery(getFileByPath, { spaceId: space.id, path })
    )
  });
  return [
    { key: '/', id: null, name: space.name },
    ...above.map(({ name, path }, index) => ({
      key: path,
      name,
      id: index === above.length - 1 ? (picked?.parentId ?? undefined) : found[index]?.data?.file.id
    })),
    ...(picked?.kind === 'folder' ? [{ key: picked.path, id: picked.id, name: picked.name }] : [])
  ];
}

function Files({ picked, words }: { picked: DriveFile | null; words: string }) {
  const space = useCurrentSpace();
  const goTo = useGoToFiles(space.id);
  const isMobile = useIsMobile();
  const open = useOpenFolders(picked);
  const picker = useRef<HTMLInputElement>(null);
  const [naming, setNaming] = useState(false);
  // On a phone: the folder whose details were asked for, and are shown over the page while it is the one picked
  const [detailing, setDetailing] = useState<string | null>(null);
  const shown = useLastGiven(picked);

  const canEdit = roleCovers(space.role, 'editor');
  const searching = words !== '';
  // The folder that is open last is where a new folder and an upload go: the folder that is picked, or the one
  // the picked file is in. Its address is always known
  const hereId = picked === null ? null : picked.kind === 'folder' ? picked.id : picked.parentId;

  // Once what is picked, or a folder it is in, is in the trash, the page has nothing to show for its address: it
  // goes to the folder that one was in, or back to all that was found
  const actions = useFileActions(space.id, async (file) => {
    if (picked === null || (picked.id !== file.id && !picked.path.startsWith(`${file.path}/`))) return;
    await goTo(searching ? null : file.parentId, words);
  });
  const onAct = canEdit ? actions.pick : undefined;

  // On a phone what is picked comes up over the page: a file always, a folder when its details are asked for, and
  // whatever was picked from what a search found, since nothing else there would show it
  const over = isMobile && picked !== null && (picked.kind === 'file' || searching || detailing === picked.id);
  const closeOver = () => {
    if (picked === null) return;
    if (detailing === picked.id) setDetailing(null);
    else void goTo(searching ? null : picked.parentId, words);
  };
  // A file shown next to what a search found is away from where it is: the pane has the way there. (A folder
  // that is still picked then is the one the search began in.)
  const locate = searching && picked?.kind === 'file';

  return (
    <>
      <PageBar
        actions={
          <>
            {!isMobile && <FileSearchField pickedId={picked?.id ?? null} words={words} className="w-48 xl:w-64" />}
            {!canEdit && (
              <Tooltip>
                <TooltipTrigger render={<Badge variant="secondary" />}>{fileText.viewOnly}</TooltipTrigger>
                <TooltipContent className="max-w-64">{fileText.viewOnlyHint}</TooltipContent>
              </Tooltip>
            )}
            {picked?.kind === 'folder' && !searching && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={fileText.details}
                onClick={() => setDetailing(picked.id)}
              >
                <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
              </Button>
            )}
            {canEdit && !searching && (
              <>
                {/* On a narrow window the buttons keep their icons and drop their words, which stay as their names */}
                <Button variant="outline" aria-label={fileText.newFolder} onClick={() => setNaming(true)}>
                  <HugeiconsIcon icon={FolderAddIcon} strokeWidth={2} data-icon="inline-start" />
                  <span className="hidden xl:inline">{fileText.newFolder}</span>
                </Button>
                <Button aria-label={fileText.upload} onClick={() => picker.current?.click()}>
                  <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} data-icon="inline-start" />
                  <span className="hidden sm:inline">{fileText.upload}</span>
                </Button>
                <input
                  ref={picker}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    if (files.length > 0) uploadFiles(space.id, hereId, files);
                    // Emptied, so that picking the same file again is a change too
                    event.target.value = '';
                  }}
                />
              </>
            )}
          </>
        }
      >
        {/* On a phone one folder is shown at a time, and this is the way up from it */}
        {picked?.kind === 'folder' && !searching && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label={fileText.moveUp}
            nativeButton={false}
            render={<FilesLink spaceId={space.id} fileId={picked.parentId} />}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
        )}
        <FilesTrail open={open} picked={picked} />
      </PageBar>

      {/* On a phone the bar has no room for the field: it is a line of its own under the bar */}
      {isMobile && (
        <div className="border-b p-2">
          <FileSearchField pickedId={picked?.id ?? null} words={words} />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {searching ? (
          <FileResults words={words} pickedId={picked?.id ?? null} />
        ) : (
          <FileColumns open={open} picked={picked} onAct={onAct} />
        )}
        <aside aria-label={fileText.details} className="hidden w-80 shrink-0 flex-col border-l md:flex xl:w-96">
          <FileInspector file={picked} onAct={onAct} locate={locate} />
        </aside>
      </div>

      {isMobile && (
        <Drawer open={over} onOpenChange={(next) => !next && closeOver()}>
          <DrawerContent>
            <DrawerHeader className="sr-only">
              <DrawerTitle>{shown?.name}</DrawerTitle>
              <DrawerDescription>{fileText.details}</DrawerDescription>
            </DrawerHeader>
            <FileInspector file={shown} onAct={onAct} locate={locate} />
          </DrawerContent>
        </Drawer>
      )}

      <NewFolderDialog spaceId={space.id} parentId={hereId} open={naming} onOpenChange={setNaming} />
      <FileDialogs {...actions.dialogs} />
    </>
  );
}
