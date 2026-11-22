import { joinSpace as definition } from '@pocketmice/contract/domains/invite';
import type { Db } from '@pocketmice/db';
import { spaceInvites } from '@pocketmice/db/schema/invite';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { and, eq, gt, sql } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function joinSpace({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    const [invite] = await db
      .select({ spaceId: spaceInvites.spaceId, role: spaceInvites.role })
      .from(spaceInvites)
      .where(and(eq(spaceInvites.id, input.inviteId), gt(spaceInvites.expiresAt, sql`now()`)));
    // An invite that never was, one that was deleted and one past its time get one answer: whoever tries ids
    // learns nothing from the difference
    if (!invite) throw new ApiError('NOT_FOUND', 'There is no such invite, or it has expired.');

    // Someone who is a member already keeps the row they have: an invite never changes a role, so opening a link
    // twice does nothing, and the owner opening their own link stays the owner
    await db
      .insert(spaceMembers)
      .values({ spaceId: invite.spaceId, userId: user.id, role: invite.role })
      .onConflictDoNothing();

    const [space] = await db
      .select({ id: spaces.id, name: spaces.name, role: spaceMembers.role })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .where(and(eq(spaceMembers.spaceId, invite.spaceId), eq(spaceMembers.userId, user.id)));
    if (!space) throw new Error(`User ${user.id} joined space ${invite.spaceId} and is not a member of it.`);

    return { space };
  });
}
