import type { getMembers } from '@pocketmice/contract/domains/space';
import type { OutputOf } from '@pocketmice/contract/operation';
import type { Db } from '@pocketmice/db';
import { profiles } from '@pocketmice/db/schema/profile';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { and, eq } from 'drizzle-orm';
import { memberSizesOf } from './storageLimit.ts';

/** A member of a space, as the contract tells one */
type Member = OutputOf<typeof getMembers>['members'][number];

/**
 * The members of a space in the order they became members, or the one member userId names: each with their name,
 * their role, how much they hold in the space and the most they may.
 */
export async function findMembers(db: Db, spaceId: string, userId?: string): Promise<Member[]> {
  const rows = await db
    .select({
      userId: spaceMembers.userId,
      name: profiles.name,
      role: spaceMembers.role,
      storageLimit: spaceMembers.storageLimit
    })
    .from(spaceMembers)
    // A member has signed in, and whoever has signed in has a profile (see ensureProfile)
    .innerJoin(profiles, eq(profiles.id, spaceMembers.userId))
    .where(and(eq(spaceMembers.spaceId, spaceId), userId === undefined ? undefined : eq(spaceMembers.userId, userId)))
    // In the order they became members; two who did at the same moment go by id, so the order is the same every
    // time
    .orderBy(spaceMembers.createdAt, spaceMembers.userId);

  const sizes = await memberSizesOf(db, spaceId);
  return rows.map((row) => ({ ...row, storageSize: sizes.get(row.userId) ?? 0 }));
}
