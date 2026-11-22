import { updateProfile as definition } from '@pocketmice/contract/domains/profile';
import type { Db } from '@pocketmice/db';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function updateProfile({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // Only the caller's own: which row changes is decided by who is signed in, and the input has no id
    const [profile] = await db
      .update(profiles)
      .set({ name: input.name })
      .where(eq(profiles.id, user.id))
      .returning({ name: profiles.name });
    // Whoever is signed in has a profile (see ensureProfile). Without one the mistake is ours
    if (!profile) throw new Error(`User ${user.id} is signed in but has no profile.`);

    return { id: user.id, email: user.email, name: profile.name };
  });
}
