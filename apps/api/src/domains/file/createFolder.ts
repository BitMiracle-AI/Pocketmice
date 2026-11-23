import { createFolder as definition } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { implement } from '../../http/operation.ts';
import { findPlace, toFile } from './findFile.ts';
import { unlessNameTaken } from './nameTaken.ts';

export function createFolder({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    const place = await findPlace(db, input.spaceId, input.parentId);

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

    return { file: toFile(created, `${place.path}/${created.name}`) };
  });
}
