import { createFolder as definition, FOLDER_DEPTH_MAX } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { ApiError, implement } from '../../http/operation.ts';
import { findPlace, toFile } from './findFile.ts';
import { unlessNameTaken } from './nameTaken.ts';

export function createFolder({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    const place = await findPlace(db, input.spaceId, input.parentId);
    // The folders the new one would be in, up to the top: it would be one deeper than the last of them
    if (place.lineage.length >= FOLDER_DEPTH_MAX) {
      throw new ApiError('CONFLICT', `Folders nest ${FOLDER_DEPTH_MAX} deep, and this one would be deeper.`);
    }

    const [created] = await unlessNameTaken(input.name, () =>
      db
        .insert(files)
        .values({
          spaceId: input.spaceId,
          parentId: input.parentId,
          name: input.name,
          kind: 'folder',
          description: input.description,
          userId: user.id
        })
        .returning()
    );
    if (!created) throw new Error('The folder was not created.');

    return { file: toFile(created, `${place.path}/${created.name}`, null) };
  });
}
