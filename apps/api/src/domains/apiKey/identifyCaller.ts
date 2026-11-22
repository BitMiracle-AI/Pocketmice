import { API_KEY_PREFIX, bearerToken } from '@pocketmice/contract/domains/apiKey';
import type { Db } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { users } from '@pocketmice/db/schema/auth';
import { eq } from 'drizzle-orm';
import type { Identified } from '../../http/operation.ts';
import { hashKey } from './key.ts';

/**
 * Tells who is calling an operation.
 * A request that carries a bearer token is judged by the token alone. If it is an API key that exists, the caller is
 * the person whose key it is. If it is anything else, the caller is nobody: the session is not looked at, so a key
 * that was deleted never falls back on whoever happens to be signed in.
 * A request without a bearer token is judged by bySession, which tells who is signed in.
 */
export function identifyCaller(db: Db, bySession: (headers: Headers) => Promise<Identified>) {
  return async (headers: Headers): Promise<Identified> => {
    const token = bearerToken(headers.get('authorization'));
    if (token === null) return bySession(headers);
    if (!token.startsWith(API_KEY_PREFIX)) return { user: null };

    const [found] = await db
      .select({ id: users.id, email: users.email, permission: apiKeys.permission })
      .from(apiKeys)
      .innerJoin(users, eq(users.id, apiKeys.userId))
      .where(eq(apiKeys.keyHash, hashKey(token)));
    if (!found) return { user: null };

    return { user: { id: found.id, email: found.email }, apiKey: { permission: found.permission } };
  };
}
