import { type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { Alone, AloneHeading } from '@/components/Alone';
import { Button } from '@/components/ui/button';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';

/**
 * What a page that failed to load shows in its place: what happened, and a button that tries again. Trying again
 * loads what the page needs once more.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <Alone>
      <AloneHeading title={commonText.somethingWentWrong}>
        <span role="alert">{thrownText(error)}</span>
      </AloneHeading>
      <Button variant="outline" className="mt-8" onClick={() => router.invalidate()}>
        {commonText.tryAgain}
      </Button>
    </Alone>
  );
}
