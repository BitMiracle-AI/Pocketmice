import { Alert02Icon } from '@hugeicons/core-free-icons';
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';
import { EmptyPage } from './EmptyPage';

/**
 * What a page that failed to load shows in its place: what happened, and a button that tries again. Trying again
 * loads what the page needs once more.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <EmptyPage
      icon={Alert02Icon}
      title={commonText.somethingWentWrong}
      description={<span role="alert">{thrownText(error)}</span>}
    >
      <Button variant="outline" onClick={() => router.invalidate()}>
        {commonText.tryAgain}
      </Button>
    </EmptyPage>
  );
}
