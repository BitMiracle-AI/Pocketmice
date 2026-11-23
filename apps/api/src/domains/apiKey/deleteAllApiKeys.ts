import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Deletes every API key of this person that works, the way deleteApiKey deletes one: the rows are marked and stay.
 * It is not an operation. It runs when an account turns out to have been used before its email address was proven
 * (see revokeUnprovenAccess in domains/auth/auth.ts): a key made in that time may be held by somebody else.
 */
export async function deleteAllApiKeys(db: Db, userId: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ deletedAt: new Date() })
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.deletedAt)));
}
