import { createApiKey as definition } from '@pocketmice/contract/domains/apiKey';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { implement } from '../../http/operation.ts';
import { newKey } from './key.ts';

export function createApiKey({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    const [created] = await db
      .insert(apiKeys)
      .values({ userId: user.id, name: input.name, permission: input.permission, key: newKey() })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        permission: apiKeys.permission,
        key: apiKeys.key,
        createdAt: apiKeys.createdAt
      });
    if (!created) throw new Error('The API key was not created.');

    return { apiKey: { ...created, createdAt: created.createdAt.toISOString() } };
  });
}
