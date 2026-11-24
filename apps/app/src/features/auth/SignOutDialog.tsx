import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';
import { signOut } from './signOut';
import { authText } from './text';

/**
 * Asks before signing out: it is pressed by mistake sooner than it is made good, since coming back takes signing
 * in again. open says whether it is asking; whatever has the way to sign out opens it.
 */
export function SignOutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    // Signed out, the page is loaded anew. This goes on only when it failed, which a message has said by then
    await signOut();
    setLeaving(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !leaving && onOpenChange(next)}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{authText.signOutTitle}</AlertDialogTitle>
          <AlertDialogDescription>{authText.signOutDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leaving}>{authText.cancel}</AlertDialogCancel>
          <AlertDialogAction disabled={leaving} onClick={leave}>
            {leaving && <Spinner data-icon="inline-start" />}
            {authText.signOut}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
