import { getProfile as definition } from '@pocketmice/contract/domains/profile';
import type { Db } from '@pocketmice/db';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function getProfile({ db }: { db: Db }) {
  return implement(definition, async ({ user }) => {
    const [profile] = await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, user.id));
    // Whoever is signed in has a profile (see ensureProfile). Without one the mistake is ours: it is reported as an
    // internal error, and no profile is made here on the quiet
    if (!profile) throw new Error(`User ${user.id} is signed in but has no profile.`);

    return { id: user.id, email: user.email, name: profile.name };
  });
}
