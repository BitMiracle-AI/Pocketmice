import type { Db } from '@pocketmice/db';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { and, eq } from 'drizzle-orm';
import type { Membership } from '../../http/operation.ts';

/**
 * What this person is in this space. Null when the space does not exist for them: there is no such space, or they
 * are not a member.
 * For every call of an operation of a space, the layer of the operations asks this first (see http/operation.ts),
 * so "is the caller a member" is decided here and nowhere else.
 */
export async function findMembership(db: Db, spaceId: string, userId: string): Promise<Membership | null> {
  const [row] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));

  return row ?? null;
}
