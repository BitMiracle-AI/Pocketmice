import { getFile as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { implement } from '../../http/operation.ts';
import { liveFile, toFile } from './findFile.ts';

export function getFile({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const found = await liveFile(db, input.spaceId, input.fileId);

    return { file: toFile(found.row, pathOfNames(found.names), found.version) };
  });
}
