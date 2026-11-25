import { Alert02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';
import { PageBar } from './PageBar';
import { shellText } from './text';

/**
 * What a page inside the frame shows in its place when its route caught something that was thrown: what happened,
 * and a button that tries again. The frame stays, so the person can still go elsewhere. title is what the bar at
 * the top calls the page; left out, the files.
 * A read that failed is not thrown: the page says so where the answer would be (PageWaiting).
 */
export function PageError({ error, title = shellText.files }: ErrorComponentProps & { title?: string }) {
  const router = useRouter();
  return (
    <>
      <PageBar title={title} />
      <WentWrong error={error} onRetry={() => router.invalidate()} />
    </>
  );
}

/** What went wrong, in the place of what did not come to be shown, and the button that tries again */
export function WentWrong({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{commonText.somethingWentWrong}</EmptyTitle>
        <EmptyDescription role="alert">{thrownText(error)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="secondary" onClick={onRetry}>
          {commonText.tryAgain}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
