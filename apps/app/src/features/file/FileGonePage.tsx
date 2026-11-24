import { FolderOpenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { PageBar } from '@/features/shell/PageBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { FilesLink } from './FilesLink';
import { fileText } from './text';

/**
 * What an address shows that names a file or a folder the space does not have: one that never was, or was put in
 * the trash
 */
export function FileGonePage() {
  const space = useCurrentSpace();
  return (
    <>
      <PageBar title={shellText.files} />
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{fileText.goneTitle}</EmptyTitle>
          <EmptyDescription>{fileText.goneDescription}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" nativeButton={false} render={<FilesLink spaceId={space.id} fileId={null} />}>
            {fileText.toFiles}
          </Button>
        </EmptyContent>
      </Empty>
    </>
  );
}
