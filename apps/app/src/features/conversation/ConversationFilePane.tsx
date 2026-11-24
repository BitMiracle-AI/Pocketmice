import { FileSearchIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { getFile } from '@pocketmice/contract/domains/file';
import { useQuery } from '@tanstack/react-query';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { FileInspector } from '@/features/file/FileInspector';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { readQuery, thrownText } from '@/lib/api';
import { conversationText } from './text';

/**
 * A file or a folder a message points at, beside the conversation: the same pane the files show what is picked in,
 * so that it is read next to what is said about it. What is done to it as a file (renaming, moving) is done where
 * the files are, and the pane has the way there.
 * fileId is what the address carries, which anyone can write: a file that is not there, or has gone since the
 * message was sent, is said to be gone.
 */
export function ConversationFilePane({ fileId }: { fileId: string }) {
  const space = useCurrentSpace();
  const found = useQuery(readQuery(getFile, { spaceId: space.id, fileId }));

  if (found.error?.code === 'NOT_FOUND') {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={FileSearchIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{conversationText.fileGone}</EmptyTitle>
          <EmptyDescription>{conversationText.fileGoneHint}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!found.data) {
    return (
      <Empty>
        <EmptyHeader>
          {found.isError ? <EmptyDescription role="alert">{thrownText(found.error)}</EmptyDescription> : <Spinner />}
        </EmptyHeader>
      </Empty>
    );
  }
  return <FileInspector file={found.data.file} locate />;
}
