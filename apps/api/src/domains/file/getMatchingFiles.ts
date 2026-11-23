import { getMatchingFiles as definition, wordsOfQuery } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { readTimeCursor, writeTimeCursor } from './cursor.ts';
import { findPlace, foldersWithin, toFile, versionsOf } from './findFile.ts';

/**
 * A word as a pattern that finds it anywhere in a text. % and _ stand for other characters in a pattern, and \ takes
 * that away from the character after it: in a word all three are themselves, so each gets a \ in front.
 */
function anywhere(word: string): string {
  return `%${word.replace(/[\\%_]/g, (sign) => `\\${sign}`)}%`;
}

export function getMatchingFiles({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const after = readTimeCursor(input.cursor);
    const place = await findPlace(db, input.spaceId, input.folderId);

    // One statement reads the page: which rows match, which of them are not in the trash, and the path of each.
    // A row says nothing of the trash its folders are in, nor of its path (see findFile.ts). Both come from the
    // folders of the place, walked down once: a row counts when it is directly in the place or its folder is one of
    // them, and its path is that folder's and its name.
    // Trashed rows are not left out after the page is cut, which would be less to write: a page could then come
    // back short, or empty, with more to find behind it.
    // The latest changed first; files changed in the same millisecond go by id, so the order is the same every
    // time. One row more than the page is read, to tell whether there is a next page.
    // No index is made for this. The rows of the space are read through, also when folderId narrows what counts;
    // in a table of many spaces the database gets to them by the index on the space and the id. It was measured
    // at 200,000 files in one space (see the commit that added this file) and left at that.
    const rows = await db
      .select({ row: files, path: sql<string>`coalesce(folder.path, ${place.path}::text) || '/' || ${files.name}` })
      .from(files)
      .leftJoin(
        sql`${foldersWithin(input.spaceId, input.folderId, place)} as folder`,
        sql`folder.id = ${files.parentId}`
      )
      .where(
        and(
          eq(files.spaceId, input.spaceId),
          isNull(files.deletedAt),
          or(
            input.folderId === null ? isNull(files.parentId) : eq(files.parentId, input.folderId),
            sql`folder.id is not null`
          ),
          ...wordsOfQuery(input.query).map((word) =>
            or(ilike(files.name, anywhere(word)), ilike(files.description, anywhere(word)))
          ),
          input.kind === undefined ? undefined : eq(files.kind, input.kind),
          after === null
            ? undefined
            : sql`(${files.updatedAt}, ${files.id}) < (${after.time}::timestamptz, ${after.id}::uuid)`
        )
      )
      .orderBy(desc(files.updatedAt), desc(files.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    const versions = await versionsOf(
      db,
      page.map(({ row }) => row)
    );

    return {
      files: page.map(({ row, path }) => toFile(row, path, versions.get(row.id) ?? null)),
      nextCursor: rows.length > input.limit && last ? writeTimeCursor(last.row.updatedAt, last.row.id) : null
    };
  });
}
