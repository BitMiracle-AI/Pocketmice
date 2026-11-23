import { FileSearchIcon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { commonText } from '@/lib/text';
import { EmptyPage } from './EmptyPage';

/** What an address with no page at it shows */
export function NotFound() {
  return (
    <EmptyPage icon={FileSearchIcon} title={commonText.notFoundTitle} description={commonText.notFoundDescription}>
      <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
        {commonText.toHome}
      </Button>
    </EmptyPage>
  );
}
