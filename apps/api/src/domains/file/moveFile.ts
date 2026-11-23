import { moveFile as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { spaces } from '@pocketmice/db/schema/space';
import { and, eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findPlace, liveFile, toFile } from './findFile.ts';
import { unlessNameTaken } from './nameTaken.ts';

export function moveFile({ db }: { db: Db }) {
  return implement(definition, ({ input }) =>
    db.transaction(async (tx) => {
      // In one space, moves happen one at a time: each waits here until the one before it is done.
      // The check below reads the folders the target is in, and is only worth something while no other move
      // changes them before this one is written. Two moves that put two folders into each other, sent together,
      // would otherwise both pass it: the two folders would hang from nothing, and nobody could get to them, or to
      // anything in them, again. One caller could do that on purpose, and the owner could not undo it.
      // What is locked is the row of the space, in the way that holds up nothing else: a file made or written in
      // the space meanwhile does not wait.
      await tx.select({ id: spaces.id }).from(spaces).where(eq(spaces.id, input.spaceId)).for('no key update');

      const found = await liveFile(tx, input.spaceId, input.fileId);
      const place = await findPlace(tx, input.spaceId, input.parentId);

      // A folder moved into itself, or into a folder inside it, would be in a loop
      if (place.lineage.includes(found.row.id)) {
        throw new ApiError('CONFLICT', 'A folder cannot be moved into itself, nor into a folder inside it.');
      }
      // It is there already: nothing to change
      if (found.row.parentId === input.parentId) {
        return { file: toFile(found.row, pathOfNames(found.names), found.version) };
      }

      const [moved] = await unlessNameTaken(found.row.name, () =>
        tx
          .update(files)
          .set({ parentId: input.parentId })
          .where(and(eq(files.spaceId, input.spaceId), eq(files.id, input.fileId)))
          .returning()
      );
      if (!moved) throw new Error(`File ${input.fileId} was found and could not be moved.`);

      return { file: toFile(moved, `${place.path}/${moved.name}`, found.version) };
    })
  );
}
