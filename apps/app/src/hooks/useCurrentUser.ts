import { useSuspenseQuery } from '@tanstack/react-query';
import { currentUserQuery } from '@/lib/api';

/**
 * Who is signed in: their id, the name they go by and the address they sign in with. For the pages that only
 * signed-in people get to: by the time one of them is drawn, the answer is there (see routes/_app.tsx).
 */
export function useCurrentUser() {
  return useSuspenseQuery(currentUserQuery).data;
}
