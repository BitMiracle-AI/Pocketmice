import { getInvites as definition } from '@pocketmice/contract/domains/invite';
import type { Db } from '@pocketmice/db';
import { spaceInvites } from '@pocketmice/db/schema/invite';
import { and, eq, gt, sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function getInvites({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const rows = await db
      .select({
        id: spaceInvites.id,
        role: spaceInvites.role,
        storageLimit: spaceInvites.storageLimit,
        expiresAt: spaceInvites.expiresAt
      })
      .from(spaceInvites)
      .where(and(eq(spaceInvites.spaceId, input.spaceId), gt(spaceInvites.expiresAt, sql`now()`)))
      // The oldest first; invites made at the same moment go by id, so the order is the same every time
      .orderBy(spaceInvites.createdAt, spaceInvites.id);

    return { invites: rows.map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString() })) };
  });
}
