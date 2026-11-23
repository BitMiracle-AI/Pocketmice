import { pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ApiError } from '../../http/operation.ts';

// Finding a file. A row of files says what the file is called and which folder it is in, and nothing else about
// where it is. Its path, and whether it is in the trash, are read from the folders it is in, up to the top of the
// space: that walk is done here, and nowhere else.

/** A row of the files table */
export type FileRow = typeof files.$inferSelect;

/** A file, together with what the folders it is in say about it */
export interface FoundFile {
  row: FileRow;
  /** The names from the top of the space down to the file. The last one is its own */
  names: string[];
  /** The ids from the file up to the top: its own first, then the folder it is in, and so on */
  lineage: string[];
  /** Whether a folder it is in was put in the trash. Whether the file itself was, is in its row */
  inTrashedFolder: boolean;
}

/** A place files are in: a folder, or directly in a space */
export interface Place {
  /** The path of the folder. Empty for directly in the space, so that the path of what is there is path/name */
  path: string;
  /** The ids from the folder up to the top, the folder's own first. Empty for directly in the space */
  lineage: string[];
}

/**
 * How many folders deep the walk goes at most. Nothing real is this deep. The limit is there so that the walk ends
 * even on a tree that has a loop in it (see moveFile for how one could come about): a file whose walk does not
 * reach the top is not found.
 */
const MAX_DEPTH = 1000;

/**
 * The files with these ids in this space, by id. An id that no file of the space has is left out.
 * Files in the trash are found too: what to make of one is up to the caller.
 */
export async function findFiles(db: Db, spaceId: string, ids: string[]): Promise<Map<string, FoundFile>> {
  const found = new Map<string, FoundFile>();
  if (ids.length === 0) return found;

  const [rows, walks] = await Promise.all([
    db
      .select()
      .from(files)
      .where(and(eq(files.spaceId, spaceId), inArray(files.id, ids))),
    // One walk per file, from the file up to the top, all of them in one statement. A walk gathers the names and
    // the ids it passes and whether a folder on the way was trashed; the row it ends on is the one with no parent
    db.execute<{ start_id: string; names: string[]; lineage: string[]; in_trashed_folder: boolean }>(sql`
      with recursive up as (
        select f.id as start_id, f.parent_id, array[f.name] as names, array[f.id::text] as lineage,
               false as in_trashed_folder, 1 as depth
        from files f
        where f.space_id = ${spaceId} and f.id in ${ids}
        union all
        select up.start_id, p.parent_id, p.name || up.names, up.lineage || p.id::text,
               up.in_trashed_folder or p.deleted_at is not null, up.depth + 1
        from up join files p on p.id = up.parent_id
        where up.depth < ${sql.raw(String(MAX_DEPTH))}
      )
      select start_id, names, lineage, in_trashed_folder from up where parent_id is null
    `)
  ]);

  const walkOf = new Map(walks.map((walk) => [walk.start_id, walk]));
  for (const row of rows) {
    const walk = walkOf.get(row.id);
    if (!walk) continue;
    found.set(row.id, { row, names: walk.names, lineage: walk.lineage, inTrashedFolder: walk.in_trashed_folder });
  }
  return found;
}

/** The file with this id in this space, in the trash or not. Null when the space has no such file */
export async function findFile(db: Db, spaceId: string, fileId: string): Promise<FoundFile | null> {
  return (await findFiles(db, spaceId, [fileId])).get(fileId) ?? null;
}

/** Whether a file is in the trash: it was put there itself, or a folder it is in was */
export function isInTrash(found: FoundFile): boolean {
  return found.row.deletedAt !== null || found.inTrashedFolder;
}

/**
 * The file an operation works on: it is in this space and not in the trash.
 * NOT_FOUND otherwise. A file in the trash gets the same answer as one that never was: for every operation but the
 * two of the trash, it does not exist.
 */
export async function liveFile(db: Db, spaceId: string, fileId: string): Promise<FoundFile> {
  const found = await findFile(db, spaceId, fileId);
  if (!found || isInTrash(found)) {
    throw new ApiError('NOT_FOUND', `There is no file ${fileId} in space ${spaceId}.`);
  }
  return found;
}

/**
 * The place that parentId names: a folder of this space that is not in the trash, or, for null, the space itself.
 * NOT_FOUND when there is no such folder.
 */
export async function findPlace(db: Db, spaceId: string, parentId: string | null): Promise<Place> {
  if (parentId === null) return { path: '', lineage: [] };

  const found = await findFile(db, spaceId, parentId);
  if (!found || isInTrash(found) || found.row.kind !== 'folder') {
    throw new ApiError('NOT_FOUND', `There is no folder ${parentId} in space ${spaceId}.`);
  }
  return { path: pathOfNames(found.names), lineage: found.lineage };
}

/** A file as an operation answers with it: its row, and the path that was worked out for it */
export function toFile(row: FileRow, path: string) {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    kind: row.kind,
    description: row.description,
    path,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
