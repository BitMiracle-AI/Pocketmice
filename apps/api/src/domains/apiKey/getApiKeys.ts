import { getApiKeys as definition } from '@pocketmice/contract/domains/apiKey';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { and, eq, isNull } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function getApiKeys({ db }: { db: Db }) {
  return implement(definition, async ({ user }) => {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        permission: apiKeys.permission,
        key: apiKeys.key,
        createdAt: apiKeys.createdAt
      })
      .from(apiKeys)
      // A key that was deleted keeps its row, and is not shown
      .where(and(eq(apiKeys.userId, user.id), isNull(apiKeys.deletedAt)))
      // The oldest first; keys made at the same moment go by id, so the order is the same every time
      .orderBy(apiKeys.createdAt, apiKeys.id);

    return { apiKeys: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  });
}
