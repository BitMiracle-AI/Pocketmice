import { getMembers as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { profiles } from '@pocketmice/db/schema/profile';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function getMembers({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const members = await db
      .select({ userId: spaceMembers.userId, name: profiles.name, role: spaceMembers.role })
      .from(spaceMembers)
      // A member has signed in, and whoever has signed in has a profile (see ensureProfile)
      .innerJoin(profiles, eq(profiles.id, spaceMembers.userId))
      .where(eq(spaceMembers.spaceId, input.spaceId))
      // In the order they became members; two who did at the same moment go by id, so the order is the same every
      // time
      .orderBy(spaceMembers.createdAt, spaceMembers.userId);

    return { members };
  });
}
