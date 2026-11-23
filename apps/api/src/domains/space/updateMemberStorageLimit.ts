import { updateMemberStorageLimit as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { and, eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findMembers } from './findMembers.ts';

export function updateMemberStorageLimit({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    // Any member, the owner too: unlike a role, a limit on the owner takes nothing away from the space
    await db
      .update(spaceMembers)
      .set({ storageLimit: input.storageLimit })
      .where(and(eq(spaceMembers.spaceId, input.spaceId), eq(spaceMembers.userId, input.userId)));

    const [member] = await findMembers(db, input.spaceId, input.userId);
    if (!member) throw new ApiError('NOT_FOUND', `Space ${input.spaceId} has no member ${input.userId}.`);
    return { member };
  });
}
