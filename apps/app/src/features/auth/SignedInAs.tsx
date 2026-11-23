import { Button } from '@/components/ui/button';
import { FieldDescription } from '@/components/ui/field';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { authText } from './text';

/**
 * Under a card that a signed-in person is asked something in: the address they are signed in with, and the way
 * to change that. Someone who has spaces and sees none, or who is asked to join as the wrong person, has signed
 * in with another address. way is what the button says, and onLeave what it does.
 */
export function SignedInAs({ way, onLeave }: { way: string; onLeave: () => void }) {
  const user = useCurrentUser();
  return (
    <div className="flex flex-col items-center">
      <FieldDescription className="text-center break-all">{authText.signedInAs(user.email)}</FieldDescription>
      <Button variant="link" size="sm" onClick={onLeave}>
        {way}
      </Button>
    </div>
  );
}
