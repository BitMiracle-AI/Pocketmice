import { emptyTrash as definition } from '@pocketmice/contract/domains/file';
import { sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { type DeleteDeps, deleteForGood } from './deleteForGood.ts';

export function emptyTrash(deps: DeleteDeps) {
  return implement(definition, async ({ input }) => {
    await deleteForGood(deps, input.spaceId, sql`f.deleted_at is not null`);

    return {};
  });
}
