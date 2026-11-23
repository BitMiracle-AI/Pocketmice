import { getFileVersions as definition } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { fileVersions } from '@pocketmice/db/schema/file';
import { and, desc, eq, sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { readTimeCursor, writeTimeCursor } from './cursor.ts';
import { selectVersions, toVersion } from './fileVersion.ts';
import { liveFile } from './findFile.ts';

export function getFileVersions({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    await liveFile(db, input.spaceId, input.fileId);
    const after = readTimeCursor(input.cursor);

    // The latest first; versions of the same millisecond go by id, so the order is the same every time.
    // One row more than the page is read, to tell whether there is a next page
    const rows = await selectVersions(db)
      .where(
        and(
          eq(fileVersions.fileId, input.fileId),
          after === null
            ? undefined
            : sql`(${fileVersions.createdAt}, ${fileVersions.id}) < (${after.time}::timestamptz, ${after.id}::uuid)`
        )
      )
      .orderBy(desc(fileVersions.createdAt), desc(fileVersions.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);

    return {
      versions: page.map(toVersion),
      nextCursor: rows.length > input.limit && last ? writeTimeCursor(last.createdAt, last.id) : null
    };
  });
}
