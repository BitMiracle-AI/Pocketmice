import { deleteInvite as definition } from '@pocketmice/contract/domains/invite';
import type { Db } from '@pocketmice/db';
import { spaceInvites } from '@pocketmice/db/schema/invite';
import { and, eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function deleteInvite({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    // Only an invite to the space the caller owns: an invite to another space is answered like one that does not
    // exist
    const deleted = await db
      .delete(spaceInvites)
      .where(and(eq(spaceInvites.id, input.inviteId), eq(spaceInvites.spaceId, input.spaceId)))
      .returning({ id: spaceInvites.id });
    if (deleted.length === 0) {
      throw new ApiError('NOT_FOUND', `Space ${input.spaceId} has no invite ${input.inviteId}.`);
    }

    return {};
  });
}
