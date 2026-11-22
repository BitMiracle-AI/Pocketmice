import { leaveSpace as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { and, eq, ne } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function leaveSpace({ db }: { db: Db }) {
  return implement(definition, async ({ input, user, membership }) => {
    if (membership.role === 'owner') {
      throw new ApiError(
        'CONFLICT',
        'The owner of a space cannot leave it: nobody would be left to decide who is in it.'
      );
    }

    await db.delete(spaceMembers).where(
      and(
        eq(spaceMembers.spaceId, input.spaceId),
        eq(spaceMembers.userId, user.id),
        // As in updateMember: no way of getting here leaves a space without an owner
        ne(spaceMembers.role, 'owner')
      )
    );

    return {};
  });
}
