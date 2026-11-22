import { getSpaces as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function getSpaces({ db }: { db: Db }) {
  return implement(definition, async ({ user }) => {
    const rows = await db
      .select({ id: spaces.id, name: spaces.name })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .where(eq(spaceMembers.userId, user.id))
      // The oldest first; spaces made at the same moment go by id, so the order is the same every time
      .orderBy(spaces.createdAt, spaces.id);

    return { spaces: rows };
  });
}
