import { getFiles as definition } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { findPlace, toFile, versionsOf } from './findFile.ts';

export function getFiles({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const place = await findPlace(db, input.spaceId, input.parentId);

    // In one place a name is used once, so the names put what is there in one order, the same every time. A page
    // ends on a name and the next begins after it: the cursor is that name.
    // One row more than the page is read, to tell whether there is a next page
    const rows = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.spaceId, input.spaceId),
          input.parentId === null ? isNull(files.parentId) : eq(files.parentId, input.parentId),
          isNull(files.deletedAt),
          input.cursor === undefined ? undefined : gt(files.name, input.cursor)
        )
      )
      .orderBy(files.name)
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const versions = await versionsOf(db, page);

    return {
      files: page.map((row) => toFile(row, `${place.path}/${row.name}`, versions.get(row.id) ?? null)),
      nextCursor: rows.length > input.limit ? (page.at(-1)?.name ?? null) : null
    };
  });
}
