import { updateFile as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { liveFile, toFile } from './findFile.ts';
import { unlessNameTaken } from './nameTaken.ts';

export function updateFile({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const found = await liveFile(db, input.spaceId, input.fileId);

    // What the input leaves out is not written, and stays as it is
    const [updated] = await unlessNameTaken(input.name ?? found.row.name, () =>
      db
        .update(files)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description })
        })
        .where(and(eq(files.spaceId, input.spaceId), eq(files.id, input.fileId)))
        .returning()
    );
    if (!updated) throw new Error(`File ${input.fileId} was found and could not be updated.`);

    // The folders it is in are the same as before; only its own name, the last of the path, may be another
    return { file: toFile(updated, pathOfNames([...found.names.slice(0, -1), updated.name])) };
  });
}
