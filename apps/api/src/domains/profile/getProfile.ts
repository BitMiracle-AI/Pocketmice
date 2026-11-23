import { getProfile as definition } from '@pocketmice/contract/domains/profile';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function getProfile({ db }: { db: Db }) {
  return implement(definition, async ({ user, apiKeyId }) => {
    const [profile] = await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, user.id));
    // Whoever is signed in has a profile (see ensureProfile). Without one the mistake is ours: it is reported as an
    // internal error, and no profile is made here on the quiet
    if (!profile) throw new Error(`User ${user.id} is signed in but has no profile.`);

    // Which key the call came with is told back to the caller, and decides nothing
    let apiKey: { id: string; name: string } | null = null;
    if (apiKeyId !== null) {
      const [key] = await db
        .select({ id: apiKeys.id, name: apiKeys.name })
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId));
      // The request was let in by this key a moment ago, and a key that is deleted keeps its row
      if (!key) throw new Error(`The request came with API key ${apiKeyId}, which has no row.`);
      apiKey = key;
    }

    return { id: user.id, email: user.email, name: profile.name, apiKey };
  });
}
