import { updateSpaceStorageLimit as definition } from '@pocketmice/contract/domains/space';
import type { Db } from '@pocketmice/db';
import { spaces } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { spaceSizeOf } from './storageLimit.ts';

export function updateSpaceStorageLimit({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    // Whatever the space holds now: a limit under it removes nothing, and is a limit from here on
    await db.update(spaces).set({ storageLimit: input.storageLimit }).where(eq(spaces.id, input.spaceId));
    return spaceSizeOf(db, input.spaceId);
  });
}
