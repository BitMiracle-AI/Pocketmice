import { redirect } from '@tanstack/react-router';
import { currentUserQuery, queryClient } from '@/lib/api';
import { nextPathFrom } from './nextPath';

// What the pages for signing in and signing up share, before either is shown.

/** What the address of such a page may carry: where to go once signed in (see nextPath.ts) */
export interface AuthSearch {
  next?: string;
}

/**
 * Reads next from the address. One that is not taken is written as undefined, not left out: the router lays what
 * is returned here over what the address had, and a value that was left out would stay as it came.
 */
export function authSearch(search: Record<string, unknown>): AuthSearch {
  return { next: nextPathFrom(search.next) };
}

/**
 * Someone who is signed in has nothing to do on such a page, and is sent on to where they were going. Whether they
 * are is what the api says: asked now, unless it was asked within the last minute.
 * An api that cannot be asked counts as "not signed in" here: the page then says so itself, when it loads.
 */
export async function leaveIfSignedIn({ next }: AuthSearch): Promise<void> {
  const signedIn = await queryClient.fetchQuery(currentUserQuery).then(
    () => true,
    () => false
  );
  if (signedIn) throw redirect({ href: next ?? '/' });
}
