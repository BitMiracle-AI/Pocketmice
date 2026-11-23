import { Alert02Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { thrownText } from '@/lib/api';
import { formatWhen } from '@/lib/format';
import { commonText } from '@/lib/text';
import { FileIcon } from './FileIcon';
import { FilesLink } from './FilesLink';
import { placeOf } from './fileOrder';
import { useMatches } from './search';
import { fileText } from './text';

/**
 * What the words in the address found, in place of the columns: the files and folders of the whole space that
 * have every word in their name or their description, the latest changed first. What is found is from all over
 * the space, so each says where it is: two things of one name are told apart by that.
 * Picking one shows it in the pane on the right, and the words stay: the list is still there to pick another.
 */
export function FileResults({ words, pickedId }: { words: string; pickedId: string | null }) {
  const space = useCurrentSpace();
  const found = useMatches(space.id, words);
  const files = found.data?.pages.flatMap((page) => page.files) ?? null;

  if (files === null && found.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{commonText.somethingWentWrong}</EmptyTitle>
          <EmptyDescription role="alert">{thrownText(found.error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => found.refetch()}>
            {commonText.tryAgain}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }
  // Nothing to show yet: the field says that it is being looked for
  if (files === null || (files.length === 0 && found.isPlaceholderData)) return <div className="flex-1" />;
  if (files.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle className="break-words">{fileText.searchNothingTitle(words)}</EmptyTitle>
          <EmptyDescription>{fileText.searchNothingHint}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ScrollArea className="min-h-0 min-w-0 flex-1">
      {/* While other words are being looked for, what the words before found stays, dimmed */}
      <div className={cn('flex flex-col gap-4 p-4 transition-opacity', found.isPlaceholderData && 'opacity-50')}>
        <ItemGroup aria-label={fileText.searchFound}>
          {files.map((file) => (
            <Item
              key={file.id}
              size="sm"
              variant={file.id === pickedId ? 'muted' : 'default'}
              render={<FilesLink spaceId={space.id} fileId={file.id} words={words} />}
            >
              <ItemMedia variant="icon">
                <FileIcon name={file.name} folder={file.kind === 'folder'} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{file.name}</ItemTitle>
                <ItemDescription>
                  {placeOf(file.path) ?? space.name}
                  {file.description && <> · {file.description}</>}
                </ItemDescription>
              </ItemContent>
              <ItemContent className="hidden flex-none sm:flex">
                <ItemDescription>{formatWhen(file.updatedAt)}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        {found.hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" disabled={found.isFetchingNextPage} onClick={() => found.fetchNextPage()}>
              {found.isFetchingNextPage && <Spinner data-icon="inline-start" />}
              {fileText.showMore}
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
