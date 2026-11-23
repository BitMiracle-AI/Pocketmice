import { deleteFile as definition } from '@pocketmice/contract/domains/file';
import { sql } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { type DeleteDeps, deleteForGood } from './deleteForGood.ts';

export function deleteFile(deps: DeleteDeps) {
  return implement(definition, async ({ input }) => {
    // Only a file that was put in the trash itself: one that is not in the trash is trashed first, and one that is
    // there because its folder is goes with the folder
    const picked = await deleteForGood(deps, input.spaceId, sql`f.id = ${input.fileId} and f.deleted_at is not null`);
    if (picked === 0) {
      throw new ApiError('NOT_FOUND', `No file ${input.fileId} was put in the trash of space ${input.spaceId}.`);
    }

    return {};
  });
}
