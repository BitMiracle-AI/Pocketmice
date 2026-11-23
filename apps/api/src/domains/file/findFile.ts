import { pathOfNames } from '@pocketmice/contract/domains/file';
import type { DbReader } from '@pocketmice/db';
import { files } from '@pocketmice/db/schema/file';
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { ApiError } from '../../http/operation.ts';
import { type FileVersion, findVersions } from './fileVersion.ts';

// Finding a file. A row of files says what the file is called and which folder it is in, and nothing else about
// where it is. Its path, and whether it is in the trash, are read from the folders it is in, up to the top of the
// space: that walk is done here, and nowhere else.
// It is done in two directions. For a few files that are known, up from each of them (findFiles). For everything
// in a place, down from the place (foldersWithin): walking up from every file of a space would be a walk for each.

/** A row of the files table */
export type FileRow = typeof files.$inferSelect;

/** A file, together with its content now and what the folders it is in say about it */
export interface FoundFile {
  row: FileRow;
  /** The version that is its content now. Null for a folder */
  version: FileVersion | null;
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
 * How many folders deep the walk goes at most. The api makes nothing nearly this deep (FOLDER_DEPTH_MAX in the
 * contract) and never a loop (see moveFile.ts). The limit is there so that the walk ends whatever the table holds:
 * rows written past the api could be deeper, or in a loop, and a file whose walk does not reach the top is not
 * found.
 */
const MAX_DEPTH = 1000;

/**
 * The files with these ids in this space, by id. An id that no file of the space has is left out.
 * Files in the trash are found too: what to make of one is up to the caller.
 */
export async function findFiles(db: DbReader, spaceId: string, ids: string[]): Promise<Map<string, FoundFile>> {
  const found = new Map<string, FoundFile>();
  if (ids.length === 0) return found;

  const [rows, walks] = await Promise.all([
    db
      .select()
      .from(files)
      .where(and(eq(files.spaceId, spaceId), inArray(files.id, ids))),
    // One walk per file, from the file up to the top, all of them in one statement. A step of a walk is a row for
    // the one file or folder it is at; the names and the ids are put together at the end, for each walk that came
    // to a row with no parent.
    // A step does not carry what the walk has passed so far. It did once, and every step then copied all the names
    // before it: a walk cost the square of its depth, and at the depth and the length of name the contract allows,
    // a page of a thousand files in the trash took longer than a statement may (30 s). This way it takes under one.
    db.execute<{ start_id: string; names: string[]; lineage: string[]; in_trashed_folder: boolean }>(sql`
      with recursive up as (
        select f.id as start_id, f.id, f.parent_id, f.name, false as trashed_folder, 1 as depth
        from files f
        where f.space_id = ${spaceId} and f.id in ${ids}
        union all
        select up.start_id, p.id, p.parent_id, p.name, p.deleted_at is not null, up.depth + 1
        from up join files p on p.id = up.parent_id
        where up.depth < ${sql.raw(String(MAX_DEPTH))}
      )
      select start_id, array_agg(name order by depth desc) as names, array_agg(id::text order by depth) as lineage,
             bool_or(trashed_folder) as in_trashed_folder
      from up
      group by start_id
      having bool_or(parent_id is null)
    `)
  ]);

  const versions = await versionsOf(db, rows);
  const walkOf = new Map(walks.map((walk) => [walk.start_id, walk]));
  for (const row of rows) {
    const walk = walkOf.get(row.id);
    if (!walk) continue;
    found.set(row.id, {
      row,
      version: versions.get(row.id) ?? null,
      names: walk.names,
      lineage: walk.lineage,
      inTrashedFolder: walk.in_trashed_folder
    });
  }
  return found;
}

/** The content these rows have now, by the id of the file. A folder is left out: it has none */
export async function versionsOf(db: DbReader, rows: FileRow[]): Promise<Map<string, FileVersion>> {
  const current = await findVersions(
    db,
    rows.flatMap((row) => (row.versionId === null ? [] : [row.versionId]))
  );
  const byFile = new Map<string, FileVersion>();
  for (const row of rows) {
    const version = row.versionId === null ? undefined : current.get(row.versionId);
    if (version) byFile.set(row.id, version);
  }
  return byFile;
}

/** The file with this id in this space, in the trash or not. Null when the space has no such file */
export async function findFile(db: DbReader, spaceId: string, fileId: string): Promise<FoundFile | null> {
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
export async function liveFile(db: DbReader, spaceId: string, fileId: string): Promise<FoundFile> {
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
export async function findPlace(db: DbReader, spaceId: string, parentId: string | null): Promise<Place> {
  if (parentId === null) return { path: '', lineage: [] };

  const found = await findFile(db, spaceId, parentId);
  if (!found || isInTrash(found) || found.row.kind !== 'folder') {
    throw new ApiError('NOT_FOUND', `There is no folder ${parentId} in space ${spaceId}.`);
  }
  return { path: pathOfNames(found.names), lineage: found.lineage };
}

/**
 * The folders in a place, and the folders in those, down to the last: each with its id and its path. It is a part
 * of a statement, to be joined to under a name.
 * Folders in the trash are left out, and so is everything below them, which the walk then never reaches. So of the
 * rows of the space that are not trashed themselves, the ones that are in the place and not in the trash are those
 * directly in it and those whose folder is among these; and the path of one of those is the path of its folder, a
 * / and its name.
 * place is what findPlace answered. That is also why this walk needs no limit on its depth: the place reaches the
 * top of the space, so nothing that is reached from it is in a loop.
 */
export function foldersWithin(spaceId: string, place: Place): SQL {
  // The folder the place is: the first of its lineage. The space itself has none
  const [folderId] = place.lineage;
  return sql`(
    with recursive down as (
      select f.id, ${place.path}::text || '/' || f.name as path
      from files f
      where f.space_id = ${spaceId} and ${folderId === undefined ? sql`f.parent_id is null` : sql`f.parent_id = ${folderId}`}
        and f.kind = 'folder' and f.deleted_at is null
      union all
      select c.id, down.path || '/' || c.name
      from down join files c on c.parent_id = down.id
      where c.kind = 'folder' and c.deleted_at is null
    )
    select id, path from down
  )`;
}

/** A file as an operation answers with it: its row, the path that was worked out for it, and its content now */
export function toFile(row: FileRow, path: string, version: FileVersion | null) {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    kind: row.kind,
    description: row.description,
    path,
    version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
