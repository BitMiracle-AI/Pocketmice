import { moveFile as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findPlace, liveFile, toFile } from './findFile.ts';
import { unlessNameTaken } from './nameTaken.ts';

export function moveFile({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const found = await liveFile(db, input.spaceId, input.fileId);
    const place = await findPlace(db, input.spaceId, input.parentId);

    // A folder moved into itself, or into a folder inside it, would be in a loop that hangs from nothing: it and
    // everything in it could no longer be reached from the top of the space.
    // Known, and left as it is: two people who at the same moment move two folders into each other both pass this
    // check, and the loop is made. A file in such a loop is not found by anything (see MAX_DEPTH in findFile.ts);
    // deleting the space still removes it
    if (place.lineage.includes(found.row.id)) {
      throw new ApiError('CONFLICT', 'A folder cannot be moved into itself, nor into a folder inside it.');
    }
    // It is there already: nothing to change
    if (found.row.parentId === input.parentId) {
      return { file: toFile(found.row, pathOfNames(found.names), found.version) };
    }

    const [moved] = await unlessNameTaken(found.row.name, () =>
      db
        .update(files)
        .set({ parentId: input.parentId })
        .where(and(eq(files.spaceId, input.spaceId), eq(files.id, input.fileId)))
        .returning()
    );
    if (!moved) throw new Error(`File ${input.fileId} was found and could not be moved.`);

    return { file: toFile(moved, `${place.path}/${moved.name}`, found.version) };
  });
}
