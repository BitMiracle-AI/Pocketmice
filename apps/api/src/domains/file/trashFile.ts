import { trashFile as definition } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { liveFile } from './findFile.ts';

export function trashFile({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    await liveFile(db, input.spaceId, input.fileId);

    // Only this row is marked. What is in a trashed folder is in the trash because the folder is (see findFile.ts).
    // updatedAt is written as it was: going into the trash changes nothing about the file, and restoring it gives
    // back the file as it was
    await db
      .update(files)
      .set({ deletedAt: new Date(), updatedAt: sql`${files.updatedAt}` })
      .where(and(eq(files.spaceId, input.spaceId), eq(files.id, input.fileId), isNull(files.deletedAt)));

    return {};
  });
}
