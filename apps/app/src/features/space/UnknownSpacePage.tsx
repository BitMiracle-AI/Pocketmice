import { FolderOffIcon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import { EmptyPage } from '@/components/EmptyPage';
import { Button } from '@/components/ui/button';
import { commonText } from '@/lib/text';
import { spaceText } from './text';

/** What an address shows that names a space the person is not in, or one that does not exist: the two look alike */
export function UnknownSpacePage() {
  return (
    <EmptyPage icon={FolderOffIcon} title={spaceText.unknownTitle} description={spaceText.unknownDescription}>
      <Button nativeButton={false} render={<Link to="/" />}>
        {commonText.toHome}
      </Button>
    </EmptyPage>
  );
}
