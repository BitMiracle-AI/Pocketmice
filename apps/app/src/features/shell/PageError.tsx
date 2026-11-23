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
 * What a page inside the frame shows in its place when it failed to load: what happened, and a button that tries
 * again. The frame stays, so the person can still go elsewhere. title is what the bar at the top calls the page;
 * left out, the files.
 */
export function PageError({ error, title = shellText.files }: ErrorComponentProps & { title?: string }) {
  const router = useRouter();
  return (
    <>
      <PageBar title={title} />
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{commonText.somethingWentWrong}</EmptyTitle>
          <EmptyDescription role="alert">{thrownText(error)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={() => router.invalidate()}>
            {commonText.tryAgain}
          </Button>
        </EmptyContent>
      </Empty>
    </>
  );
}
