import { profileName, updateProfile } from '@pocketmice/contract/domains/profile';
import { call, currentUserQuery, failureText, queryClient } from '@/lib/api';
import { profileText } from './text';

// The person's own profile: the name they go by. Who is signed in is read with useCurrentUser; this changes it.

/**
 * Changes the name the person goes by. Null when it is changed, or the sentence that says why it is not.
 * The name is in more answers than the profile: the members of a space, who wrote a version. Everything read is
 * marked stale, and what a page is showing is asked for again.
 */
export async function changeName(name: string): Promise<string | null> {
  const checked = profileName.safeParse(name);
  if (!checked.success) return profileText.nameMissing;

  const result = await call(updateProfile, { name: checked.data });
  if (!result.ok) return failureText(result.code, {});

  // Only the name is taken from the answer: whatever else is known about who is signed in stays as it was read
  const { name: taken } = result.data;
  queryClient.setQueryData(currentUserQuery.queryKey, (old) => (old ? { ...old, name: taken } : old));
  void queryClient.invalidateQueries();
  return null;
}
