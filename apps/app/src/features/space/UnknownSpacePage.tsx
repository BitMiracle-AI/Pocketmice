import { Link } from '@tanstack/react-router';
import { Alone, AloneHeading } from '@/components/Alone';
import { buttonVariants } from '@/components/ui/button';
import { spaceText } from './text';

/** What an address shows that names a space the person is not in, or one that does not exist: the two look alike */
export function UnknownSpacePage() {
  return (
    <Alone>
      <AloneHeading title={spaceText.unknownTitle}>{spaceText.unknownDescription}</AloneHeading>
      <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-8' })}>
        {spaceText.toHome}
      </Link>
    </Alone>
  );
}
