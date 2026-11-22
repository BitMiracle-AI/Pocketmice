import { createSpace as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { implement } from '../../http/operation.ts';

export function createSpace({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // The space and its owner's row are made in one transaction: a space with no member, which nobody could get
    // into, is never left behind
    const space = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(spaces)
        .values({ name: input.name, userId: user.id })
        .returning({ id: spaces.id, name: spaces.name });
      if (!created) throw new Error('The space was not created.');
      await tx.insert(spaceMembers).values({ spaceId: created.id, userId: user.id, role: 'owner' });
      return created;
    });

    return { space: { ...space, role: 'owner' as const } };
  });
}
