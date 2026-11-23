import { BubbleChatIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { conversationText } from './text';

/**
 * What an address shows that names a conversation the person cannot read: one that never was, one that was
 * deleted, one they left or were taken out of. The three look alike to them, as they do to the api.
 */
export function ConversationGonePage() {
  const space = useCurrentSpace();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{conversationText.goneTitle}</EmptyTitle>
        <EmptyDescription>{conversationText.goneDescription}</EmptyDescription>
      </EmptyHeader>
      {/* Where the list is next to this, it is the way on; where it is not, this is */}
      <EmptyContent className="@3xl:hidden">
        <Link
          to="/spaces/$spaceId/conversations"
          params={{ spaceId: space.id }}
          className={buttonVariants({ variant: 'outline' })}
        >
          {conversationText.toList}
        </Link>
      </EmptyContent>
    </Empty>
  );
}
