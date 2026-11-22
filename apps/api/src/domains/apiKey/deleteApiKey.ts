import { deleteApiKey as definition } from '@pocketmice/contract/domains/apiKey';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { and, eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function deleteApiKey({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // Only the caller's own: somebody else's key is answered like one that does not exist
    const deleted = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, input.apiKeyId), eq(apiKeys.userId, user.id)))
      .returning({ id: apiKeys.id });
    if (deleted.length === 0) throw new ApiError('NOT_FOUND', `You have no API key ${input.apiKeyId}.`);

    return {};
  });
}
