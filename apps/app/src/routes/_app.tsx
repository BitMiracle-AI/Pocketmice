import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { ApiFailure, currentUserQuery, queryClient } from '@/lib/api';

// The pages only signed-in people get to: every page in routes/_app/ is behind this one. The _app of the file
// name is not part of any address.
export const Route = createFileRoute('/_app')({
  // Who is signed in is asked before any of these pages is shown, and what the api says is what counts: nothing in
  // the browser says "signed in". An answer less than a minute old is used as it is. Once it is there, every page
  // behind this one reads it with useCurrentUser.
  // Someone who is not signed in goes to the sign-in page, with the address they were after, and comes back to it
  // once signed in. An api that cannot be asked is the page that failed to load, with its button to try again.
  beforeLoad: async ({ location }) => {
    try {
      await queryClient.fetchQuery(currentUserQuery);
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'UNAUTHENTICATED') {
        // The start is where signing in leads anyway: the address of the sign-in page stays plain
        throw redirect({ to: '/login', search: { next: location.href === '/' ? undefined : location.href } });
      }
      throw error;
    }
  },
  component: Outlet
});
