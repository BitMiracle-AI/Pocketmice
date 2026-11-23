import { toast } from '@/components/ui/toast';
import { auth, failureText } from '@/lib/api';
import { authText } from './text';

/**
 * Signs the person out and opens the sign-in page. The page is loaded anew: nothing of what this person was shown
 * stays in the page for the next one. When signing out fails, a message comes up and the page stays as it is.
 */
export function signOut(): Promise<void> {
  return signOutTo('/login');
}

/**
 * Signs the person out, for them to sign in as someone else and come back to next, an address of this app: the
 * page of an invite, which is for whoever opens it.
 */
export function signOutAndReturn(next: string): Promise<void> {
  return signOutTo(`/login?${new URLSearchParams({ next })}`);
}

async function signOutTo(address: string): Promise<void> {
  const result = await auth.signOut();
  if (result.ok) {
    window.location.assign(address);
    return;
  }
  toast.add({
    type: 'error',
    title: failureText(result.code, { TOO_MANY_REQUESTS: authText.failures.TOO_MANY_TRIES })
  });
}
