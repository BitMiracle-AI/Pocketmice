import { updateMember as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { profiles } from '@pocketmice/db/schema/profile';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { and, eq, ne } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function updateMember({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // Only the owner calls this, and a space has one owner: the member is the owner exactly when it is the caller
    if (input.userId === user.id) throw new ApiError('CONFLICT', 'The role of the owner of a space does not change.');

    const [updated] = await db
      .update(spaceMembers)
      .set({ role: input.role })
      .where(
        and(
          eq(spaceMembers.spaceId, input.spaceId),
          eq(spaceMembers.userId, input.userId),
          // The line above already rules the owner out. Written again where the row is changed, so that no way of
          // getting here turns an owner into something else and leaves a space without one
          ne(spaceMembers.role, 'owner')
        )
      )
      .returning({ role: spaceMembers.role });
    if (!updated) throw new ApiError('NOT_FOUND', `Space ${input.spaceId} has no member ${input.userId}.`);

    const [profile] = await db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, input.userId));
    // A member has signed in, and whoever has signed in has a profile (see ensureProfile)
    if (!profile) throw new Error(`User ${input.userId} is a member of a space but has no profile.`);

    return { member: { userId: input.userId, name: profile.name, role: updated.role } };
  });
}
