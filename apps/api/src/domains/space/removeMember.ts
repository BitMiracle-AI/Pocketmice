import { removeMember as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { and, eq, ne } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function removeMember({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // Only the owner calls this, and a space has one owner: the member is the owner exactly when it is the caller
    if (input.userId === user.id) throw new ApiError('CONFLICT', 'The owner of a space cannot be removed from it.');

    const removed = await db
      .delete(spaceMembers)
      .where(
        and(
          eq(spaceMembers.spaceId, input.spaceId),
          eq(spaceMembers.userId, input.userId),
          // As in updateMember: no way of getting here leaves a space without an owner
          ne(spaceMembers.role, 'owner')
        )
      )
      .returning({ userId: spaceMembers.userId });
    if (removed.length === 0) throw new ApiError('NOT_FOUND', `Space ${input.spaceId} has no member ${input.userId}.`);

    return {};
  });
}
