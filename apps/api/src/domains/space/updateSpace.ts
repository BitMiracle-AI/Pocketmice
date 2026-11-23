import { updateSpace as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaces } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function updateSpace({ db }: { db: Db }) {
  return implement(definition, async ({ input, membership }) => {
    const [space] = await db
      .update(spaces)
      .set({ name: input.name })
      .where(eq(spaces.id, input.spaceId))
      .returning({ id: spaces.id, name: spaces.name });
    // The caller is its owner, so the space is there
    if (!space) throw new Error(`Space ${input.spaceId} has an owner and could not be renamed.`);

    return { space: { ...space, role: membership.role } };
  });
}
