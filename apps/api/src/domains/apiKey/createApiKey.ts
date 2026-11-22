import { createApiKey as definition } from '@pocketmice/contract/domains/apiKey';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { implement } from '../../http/operation.ts';
import { hashKey, newKey } from './key.ts';

export function createApiKey({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // The key leaves the server in this one response. What is stored cannot be turned back into it
    const key = newKey();
    const [created] = await db
      .insert(apiKeys)
      .values({ userId: user.id, name: input.name, permission: input.permission, keyHash: hashKey(key) })
      .returning({
        id: apiKeys.id,
        name: apiKeys.name,
        permission: apiKeys.permission,
        createdAt: apiKeys.createdAt
      });
    if (!created) throw new Error('The API key was not created.');

    return { apiKey: { ...created, createdAt: created.createdAt.toISOString() }, key };
  });
}
