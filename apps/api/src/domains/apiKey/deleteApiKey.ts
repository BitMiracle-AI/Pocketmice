import { deleteApiKey as definition } from '@pocketmice/contract/domains/apiKey';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function deleteApiKey({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // The row is marked, not removed: what was done with the key can still name it.
    // Only the caller's own, and only one that works: somebody else's key, and one deleted before, are answered
    // like one that does not exist
    const deleted = await db
      .update(apiKeys)
      .set({ deletedAt: new Date() })
      .where(and(eq(apiKeys.id, input.apiKeyId), eq(apiKeys.userId, user.id), isNull(apiKeys.deletedAt)))
      .returning({ id: apiKeys.id });
    if (deleted.length === 0) throw new ApiError('NOT_FOUND', `You have no API key ${input.apiKeyId}.`);

    return {};
  });
}
