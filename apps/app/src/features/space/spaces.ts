import { createSpace, getSpaces, spaceName } from '@pocketmice/contract/domains/space';
import type { OutputOf } from '@pocketmice/contract/operation';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { call, failureText, queryClient, readQuery } from '@/lib/api';
import { spaceText } from './text';

// The spaces the person is in. A space is where everything is: a page that shows files is the page of one space,
// and which one is in its address (/spaces/<id>), nowhere else. The server makes no space for anyone, so someone
// may be in none: the start then asks them to make one.

/** A space, with the person's own role in it */
export type Space = OutputOf<typeof getSpaces>['spaces'][number];

/**
 * The spaces the person is in, the oldest first. Like who is signed in, it is kept while the page is open: the
 * frame of every page of a space reads it.
 */
export const spacesQuery = queryOptions({ ...readQuery(getSpaces, {}), gcTime: Number.POSITIVE_INFINITY });

/** The spaces the person is in. For a page whose route has loaded them */
export function useSpaces(): Space[] {
  return useSuspenseQuery(spacesQuery).data.spaces;
}

/**
 * Makes sure the list of spaces is there before the page of the space spaceId is shown. When what the cache holds
 * does not have that space, the api is asked again before anyone is told "no such space": the person may have
 * joined it a moment ago, in another tab.
 */
export async function loadSpaces(spaceId: string): Promise<void> {
  const { spaces } = await queryClient.ensureQueryData(spacesQuery);
  if (!spaces.some((space) => space.id === spaceId)) await queryClient.fetchQuery({ ...spacesQuery, staleTime: 0 });
}

/**
 * Makes a space called name. Answers with the space, which is in the list of spaces from then on; or with the
 * sentence that says why it was not made.
 */
export async function makeSpace(name: string): Promise<{ space: Space } | { problem: string }> {
  const checked = spaceName.safeParse(name);
  if (!checked.success) return { problem: spaceText.nameMissing };

  const result = await call(createSpace, { name: checked.data });
  if (!result.ok) return { problem: failureText(result.code, {}) };

  // The new space is put into the list at once, so the page it leads to finds it there; and the list is asked for
  // again, since what the api says is what counts
  const { space } = result.data;
  queryClient.setQueryData(spacesQuery.queryKey, (old) => (old ? { spaces: [...old.spaces, space] } : old));
  void queryClient.invalidateQueries({ queryKey: spacesQuery.queryKey });
  return { space };
}
