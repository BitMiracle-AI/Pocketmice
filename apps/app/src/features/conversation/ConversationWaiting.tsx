import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';
import type { Opening } from './conversations';
import { conversationText } from './text';

// What stands in the place of a conversation that is not shown yet, or could not be. The list next to it stays;
// where the list has no room next to it, the way back to the list is at the top, where an open conversation has it.

/**
 * A conversation that is being opened: a spinner; or, when it was asked for and not answered, what went wrong and
 * a button that asks again.
 */
export function ConversationWaiting({ failed }: { failed: Opening['failed'] }) {
  if (failed) return <Failed error={failed.error} onRetry={failed.retry} />;
  return (
    <InPlace>
      <Empty>
        <EmptyHeader>
          <Spinner />
        </EmptyHeader>
      </Empty>
    </InPlace>
  );
}

/** What the route of a conversation shows when something was thrown while it was shown */
export function ConversationError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return <Failed error={error} onRetry={() => router.invalidate()} />;
}

/**
 * The way back to the list of the conversations, for the top of a conversation: shown where the list has no room
 * next to it.
 */
export function BackToList() {
  const space = useCurrentSpace();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="@3xl:hidden"
      aria-label={conversationText.backToList}
      title={conversationText.backToList}
      nativeButton={false}
      render={
        // The list is where every conversation begins, and is not this page: the link does not say it is
        <Link to="/spaces/$spaceId/conversations" params={{ spaceId: space.id }} activeOptions={{ exact: true }} />
      }
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
    </Button>
  );
}

function Failed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <InPlace>
      <Empty>
        <EmptyHeader>
          <EmptyDescription role="alert">{thrownText(error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary" onClick={onRetry}>
            {commonText.tryAgain}
          </Button>
        </EmptyContent>
      </Empty>
    </InPlace>
  );
}

/** Under a bar where the top of the conversation will be, so that what comes does not move what is there */
function InPlace({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <BackToList />
      </header>
      {children}
    </div>
  );
}
