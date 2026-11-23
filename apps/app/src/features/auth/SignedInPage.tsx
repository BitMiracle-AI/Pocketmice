import { useState } from 'react';
import { ALONE_LINK, Alone, AloneFoot, AloneHeading } from '@/components/Alone';
import { toast } from '@/components/ui/toast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { auth, failureText } from '@/lib/api';
import { authText } from './text';

/**
 * What someone who is signed in sees, until there are spaces to show them: who they are, and a way to sign out.
 */
export function SignedInPage() {
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    const result = await auth.signOut();
    if (result.ok) {
      // A page loaded anew: nothing of what this person was shown stays in the page for the next one
      window.location.assign('/login');
      return;
    }
    setBusy(false);
    toast.add({
      type: 'error',
      title: failureText(result.code, { TOO_MANY_REQUESTS: authText.failures.TOO_MANY_TRIES })
    });
  };

  return (
    <Alone>
      <AloneHeading title={user.name}>{authText.signedInAs(user.email)}</AloneHeading>
      <AloneFoot>
        <button type="button" className={ALONE_LINK} disabled={busy} onClick={signOut}>
          {authText.signOut}
        </button>
      </AloneFoot>
    </Alone>
  );
}
