import { BubbleChatIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { conversationText } from './text';

/**
 * What is shown next to the list of the conversations while none of them is open. Where there is no room for
 * both, the list is the page and this is not shown.
 */
export function NoConversationPage() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{conversationText.pickTitle}</EmptyTitle>
        <EmptyDescription>{conversationText.pickHint}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
