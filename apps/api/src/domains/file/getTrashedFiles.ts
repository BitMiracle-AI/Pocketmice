import { getTrashedFiles as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findFiles, toFile } from './findFile.ts';

/**
 * Where a page ended: the time its last file was trashed, and that file's id. Written as the two with a _ between.
 * The time alone would not do: two files trashed in the same millisecond would share it.
 */
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;

export function getTrashedFiles({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const after = input.cursor === undefined ? null : CURSOR.exec(input.cursor);
    if (input.cursor !== undefined && after === null) {
      throw new ApiError('INVALID_INPUT', 'cursor: Pass the nextCursor of the page before, as it was.');
    }

    // The latest first; files trashed at the same moment go by id, so the order is the same every time.
    // One row more than the page is read, to tell whether there is a next page
    const rows = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.spaceId, input.spaceId),
          isNotNull(files.deletedAt),
          after === null
            ? undefined
            : sql`(${files.deletedAt}, ${files.id}) < (${after[1]}::timestamptz, ${after[2]}::uuid)`
        )
      )
      .orderBy(desc(files.deletedAt), desc(files.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);

    const found = await findFiles(
      db,
      input.spaceId,
      page.map((row) => row.id)
    );

    return {
      files: page.flatMap((row) => {
        const names = found.get(row.id)?.names;
        // Gone between the two statements: restored and moved, say. It is no longer in the trash as it was read
        if (!names || row.deletedAt === null) return [];
        return [{ ...toFile(row, pathOfNames(names)), trashedAt: row.deletedAt.toISOString() }];
      }),
      nextCursor: rows.length > input.limit && last?.deletedAt ? `${last.deletedAt.toISOString()}_${last.id}` : null
    };
  });
}
