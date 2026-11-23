import { toast } from '@/components/ui/toast';
import { auth, failureText } from '@/lib/api';
import { authText } from './text';

/**
 * Signs the person out and opens the sign-in page. The page is loaded anew: nothing of what this person was shown
 * stays in the page for the next one. When signing out fails, a message comes up and the page stays as it is.
 */
export async function signOut(): Promise<void> {
  const result = await auth.signOut();
  if (result.ok) {
    window.location.assign('/login');
    return;
  }
  toast.add({
    type: 'error',
    title: failureText(result.code, { TOO_MANY_REQUESTS: authText.failures.TOO_MANY_TRIES })
  });
}
