import { getTrashedFiles as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { readTimeCursor, writeTimeCursor } from './cursor.ts';
import { findFiles, toFile } from './findFile.ts';

export function getTrashedFiles({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const after = readTimeCursor(input.cursor);

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
            : sql`(${files.deletedAt}, ${files.id}) < (${after.time}::timestamptz, ${after.id}::uuid)`
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
        const file = found.get(row.id);
        // Gone between the two statements: deleted for good, say. It is no longer in the trash as it was read
        if (!file || row.deletedAt === null) return [];
        return [{ ...toFile(row, pathOfNames(file.names), file.version), trashedAt: row.deletedAt.toISOString() }];
      }),
      nextCursor: rows.length > input.limit && last?.deletedAt ? writeTimeCursor(last.deletedAt, last.id) : null
    };
  });
}
