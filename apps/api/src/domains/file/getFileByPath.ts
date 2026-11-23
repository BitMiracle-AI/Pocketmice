import { getFileByPath as definition, namesOfPath, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { sql } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findFile, isInTrash, toFile } from './findFile.ts';

export function getFileByPath({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const nothingThere = new ApiError('NOT_FOUND', `There is nothing at ${input.path} in space ${input.spaceId}.`);
    const names = namesOfPath(input.path);
    // The definition lets in only text that is a path
    if (names === null) throw new Error(`"${input.path}" got past the definition and is not a path.`);

    // Walks down from the top of the space, one name a step, in one statement: each step is the file of that name
    // in the folder the step before found. What is in the trash is stepped over, so a path never leads into it.
    // The walk has got to the file when it has taken as many steps as the path has names
    const wanted = sql`array[${sql.join(
      names.map((name) => sql`${name}`),
      sql`, `
    )}]::text[]`;
    const [reached] = await db.execute<{ id: string }>(sql`
      with recursive wanted as (
        select ${wanted} as names
      ),
      down as (
        select f.id, 1 as depth
        from files f, wanted
        where f.space_id = ${input.spaceId} and f.parent_id is null and f.deleted_at is null
          and f.name = wanted.names[1]
        union all
        select c.id, down.depth + 1
        from down join files c on c.parent_id = down.id, wanted
        where c.deleted_at is null and c.name = wanted.names[down.depth + 1]
      )
      select id from down where depth = ${names.length}
    `);
    if (!reached) throw nothingThere;

    const found = await findFile(db, input.spaceId, reached.id);
    // It was there a moment ago: someone moved or trashed it in between
    if (!found || isInTrash(found)) throw nothingThere;

    return { file: toFile(found.row, pathOfNames(found.names)) };
  });
}
