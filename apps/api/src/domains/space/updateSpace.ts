import { updateSpace as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaces } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function updateSpace({ db }: { db: Db }) {
  return implement(definition, async ({ input, membership }) => {
    const [space] = await db
      .update(spaces)
      .set({ name: input.name })
      .where(eq(spaces.id, input.spaceId))
      .returning({ id: spaces.id, name: spaces.name });
    // The caller was a member a moment ago, so the space was there: it has been deleted since
    if (!space) throw new ApiError('UNKNOWN_SPACE', `There is no space ${input.spaceId}.`);

    return { space: { ...space, role: membership.role } };
  });
}
