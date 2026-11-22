import { createInvite as definition, INVITE_LIFETIME_DAYS } from '@pocketmice/contract/domains/invite';
import type { Db } from '@pocketmice/db';
import { spaceInvites } from '@pocketmice/db/schema/invite';
import { sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function createInvite({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    const [invite] = await db
      .insert(spaceInvites)
      .values({
        spaceId: input.spaceId,
        role: input.role,
        userId: user.id,
        // By the database's clock, the one that later decides whether the invite still works
        expiresAt: sql`now() + make_interval(days => ${INVITE_LIFETIME_DAYS})`
      })
      .returning({ id: spaceInvites.id, role: spaceInvites.role, expiresAt: spaceInvites.expiresAt });
    if (!invite) throw new Error('The invite was not created.');

    return { invite: { ...invite, expiresAt: invite.expiresAt.toISOString() } };
  });
}
