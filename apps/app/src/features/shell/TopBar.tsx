import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { UploadPanel } from '@/features/upload/UploadPanel';
import { useUploads } from '@/features/upload/uploads';
import { UserButton } from './UserMenu';

/**
 * The bar across the top of a signed-in page that has no sidebar (the start): the name of the product, and in the
 * other corner the uploads that are in hand, while there are any, and who is signed in. The uploads are the
 * page's and no space's: they go on when the person comes back here from a space.
 */
export function TopBar() {
  const uploads = useUploads();
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 lg:px-6">
      <Brand />
      <div className="flex min-w-0 items-center gap-2">
        {uploads.length > 0 && <UploadPanel render={<Button variant="ghost" size="sm" />} side="bottom" />}
        <UserButton />
      </div>
    </header>
  );
}
