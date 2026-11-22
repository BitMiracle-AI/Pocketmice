import { getApiKeys as definition } from '@pocketmice/contract/domains/apiKey';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function getApiKeys({ db }: { db: Db }) {
  return implement(definition, async ({ user }) => {
    const rows = await db
      .select({ id: apiKeys.id, name: apiKeys.name, permission: apiKeys.permission, createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.userId, user.id))
      // The oldest first; keys made at the same moment go by id, so the order is the same every time
      .orderBy(apiKeys.createdAt, apiKeys.id);

    return { apiKeys: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  });
}
