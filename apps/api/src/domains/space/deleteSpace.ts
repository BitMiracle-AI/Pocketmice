import { deleteSpace as definition } from '@pocketmice/contract/domains/space';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { eq, sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { type DeleteDeps, deleteForGood } from '../file/deleteForGood.ts';

export function deleteSpace(deps: DeleteDeps) {
  return implement(definition, async ({ input }) => {
    // The files first, with their bytes: every file of the space, in the trash or not. Picked by the space alone and
    // not by walking down from its top, so that what no path leads to goes too (see moveFile.ts for how that can be)
    await deleteForGood(deps, input.spaceId, sql`true`);

    // Then the space, with who is in it. Its invites go with its row (see the spaceInvites table). A file that
    // somebody put in between the two steps makes the second one fail, and the space stays: delete it again
    await deps.db.transaction(async (tx) => {
      await tx.delete(spaceMembers).where(eq(spaceMembers.spaceId, input.spaceId));
      await tx.delete(spaces).where(eq(spaces.id, input.spaceId));
    });

    return {};
  });
}
