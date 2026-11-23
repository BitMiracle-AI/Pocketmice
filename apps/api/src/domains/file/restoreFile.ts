import { restoreFile as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findFile, toFile } from './findFile.ts';
import { unlessNameTaken } from './nameTaken.ts';

export function restoreFile({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const found = await findFile(db, input.spaceId, input.fileId);
    // Only a file that was trashed itself is restored. One that is in the trash because its folder is has no mark
    // of its own to take away: it comes back when the folder does
    if (!found || found.row.deletedAt === null) {
      throw new ApiError('NOT_FOUND', `No file ${input.fileId} was put in the trash of space ${input.spaceId}.`);
    }
    // Taking its own mark away would not bring it back: it would still be in the trash, with the folder
    if (found.inTrashedFolder) {
      throw new ApiError('CONFLICT', 'The folder this file was in is in the trash: restore that folder first.');
    }

    // Its name was free to take while it was in the trash.
    // updatedAt is written as it was: the file comes back as it went (see trashFile)
    const [restored] = await unlessNameTaken(found.row.name, () =>
      db
        .update(files)
        .set({ deletedAt: null, updatedAt: sql`${files.updatedAt}` })
        .where(and(eq(files.spaceId, input.spaceId), eq(files.id, input.fileId), isNotNull(files.deletedAt)))
        .returning()
    );
    if (!restored) throw new Error(`File ${input.fileId} was found in the trash and could not be restored.`);

    return { file: toFile(restored, pathOfNames(found.names)) };
  });
}
