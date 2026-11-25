import {
  createSpace,
  deleteSpace,
  getSpaceSize,
  getSpaces,
  spaceName,
  updateSpace,
  updateSpaceStorageLimit
} from '@pocketmice/contract/domains/space';
import type { OutputOf } from '@pocketmice/contract/operation';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { call, failureText, queryClient, readQuery, spaceChanged } from '@/lib/api';
import { formatSize } from '@/lib/format';
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

  const { space } = result.data;
  nowIn(space);
  return { space };
}

/**
 * The person is in a space they were not in: they made it, or joined it. It is put into the list at once, so the
 * page it leads to finds it there; and the list is asked for again, since what the api says is what counts.
 */
export function nowIn(space: Space): void {
  queryClient.setQueryData(spacesQuery.queryKey, (old) =>
    old && !old.spaces.some((each) => each.id === space.id) ? { spaces: [...old.spaces, space] } : old
  );
  void queryClient.invalidateQueries({ queryKey: spacesQuery.queryKey });
}

/**
 * Gives a space another name. Null when it has it, or the sentence that says why it has not. The list of spaces
 * has the new name at once, and with it every page that names the space.
 */
export async function renameSpace(spaceId: string, name: string): Promise<string | null> {
  const checked = spaceName.safeParse(name);
  if (!checked.success) return spaceText.nameMissing;

  const result = await call(updateSpace, { spaceId, name: checked.data });
  if (!result.ok) return failureText(result.code, {});

  const { space } = result.data;
  queryClient.setQueryData(spacesQuery.queryKey, (old) =>
    old ? { spaces: old.spaces.map((each) => (each.id === space.id ? space : each)) } : old
  );
  void queryClient.invalidateQueries({ queryKey: spacesQuery.queryKey });
  return null;
}

/** How much a space holds, and the most it may */
export type SpaceSize = OutputOf<typeof getSpaceSize>;

/**
 * How much a space holds, and the most it may. Every member may read it. Whatever adds bytes to the space or
 * removes them marks it stale with everything else read from the space (spaceChanged).
 */
export function spaceSizeQuery(spaceId: string) {
  return readQuery(getSpaceSize, { spaceId });
}

/** How much a space holds, in a sentence: against its limit when it has one */
export function spaceHolds({ storageSize, storageLimit }: SpaceSize): string {
  return storageLimit === null
    ? spaceText.spaceHolds(formatSize(storageSize))
    : spaceText.spaceHoldsOf(formatSize(storageSize), formatSize(storageLimit));
}

/**
 * Sets the most a space may hold, in bytes; null takes the limit away. Null when it is set, or the sentence that
 * says why it is not. What the api answers is what the space holds and may hold now, and is what the pages show
 * at once.
 */
export async function setSpaceLimit(spaceId: string, storageLimit: number | null): Promise<string | null> {
  const result = await call(updateSpaceStorageLimit, { spaceId, storageLimit });
  if (!result.ok) return failureText(result.code, {});
  queryClient.setQueryData(spaceSizeQuery(spaceId).queryKey, result.data);
  spaceChanged(spaceId);
  return null;
}

/**
 * Deletes a space for good. Null when it is gone, or the sentence that says why it is not. A space that turns out
 * to be gone already is gone, which is what was asked for.
 * The list of spaces still has it: the page that asked is one of that space, and leaves it first (useNoLongerIn).
 */
export async function removeSpace(spaceId: string): Promise<string | null> {
  const result = await call(deleteSpace, { spaceId });
  if (!result.ok && result.code !== 'UNKNOWN_SPACE') return failureText(result.code, {});
  return null;
}

/**
 * For a page of a space, once the person is no longer in that space: they left it, or deleted it. What it hands
 * out takes the person to the start, and then takes the space out of the list, which is asked for again.
 * In that order, and so in one place: a page of a space that is not on the list says "no such space" (SpaceShell),
 * which is true of a space someone else took the person out of, and is not what happened here.
 */
export function useNoLongerIn(): (spaceId: string) => Promise<void> {
  const navigate = useNavigate();
  return async (spaceId) => {
    await navigate({ to: '/', replace: true });
    queryClient.setQueryData(spacesQuery.queryKey, (old) =>
      old ? { spaces: old.spaces.filter((each) => each.id !== spaceId) } : old
    );
    void queryClient.invalidateQueries({ queryKey: spacesQuery.queryKey });
  };
}
