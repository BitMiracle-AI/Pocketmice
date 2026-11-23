import { Link } from '@tanstack/react-router';
import { Alone, AloneHeading } from '@/components/Alone';
import { buttonVariants } from '@/components/ui/button';
import { commonText } from '@/lib/text';

/** What an address with no page at it shows */
export function NotFound() {
  return (
    <Alone>
      <AloneHeading title={commonText.notFoundTitle}>{commonText.notFoundDescription}</AloneHeading>
      <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-8' })}>
        {commonText.toHome}
      </Link>
    </Alone>
  );
}
