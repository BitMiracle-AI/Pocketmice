import { FolderOpenIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { fileText } from './text';

/**
 * What an address shows that names a file or a folder the space does not have: one that never was, or was put in
 * the trash
 */
export function FileGonePage() {
  const space = useCurrentSpace();
  return (
    <>
      <MainBar trail={[]} title={shellText.files} />
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={FolderOpenIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{fileText.goneTitle}</EmptyTitle>
          <EmptyDescription>{fileText.goneDescription}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/spaces/$spaceId" params={{ spaceId: space.id }} className={buttonVariants({ variant: 'outline' })}>
            {fileText.toFiles}
          </Link>
        </EmptyContent>
      </Empty>
    </>
  );
}
