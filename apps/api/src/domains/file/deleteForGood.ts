import type { Db } from '@pocketmice/db';
import { type SQL, sql } from 'drizzle-orm';
import type { FileStorage } from '../../storage/fileStorage.ts';
import { removeContent } from './writeContent.ts';

// Deleting for good: the one thing done to files that destroys content.
// The order is the reverse of writing (see writeContent.ts), for the same promise: the rows go first, in one
// statement, and the bytes after. A process that dies in between leaves bytes that no row points at, never a row
// without its bytes.

export interface DeleteDeps {
  db: Db;
  storage: FileStorage;
  reportError: (error: unknown, where: string) => void;
}

/**
 * Deletes for good the files of this space that roots picks, and with each folder everything in it: their rows,
 * the rows of every version of them, and then the bytes. roots is a condition on the files table, written for the
 * alias f. Returns how many of the picked files there were.
 */
export async function deleteForGood({ db, storage, reportError }: DeleteDeps, spaceId: string, roots: SQL) {
  // One statement. It walks down from the picked files, notes every version of what it found, and deletes the rows
  // it found; the rows of the versions go with their files (see the fileVersions table). What it notes is read
  // from how things were before the statement, so the versions are still there to be listed
  const gone = await db.execute<{ version_id: string | null; picked: number }>(sql`
    with recursive tree as (
      select f.id, true as picked from files f where f.space_id = ${spaceId} and ${roots}
      union
      select c.id, false from tree join files c on c.parent_id = tree.id
    ),
    deleted as (
      delete from files where id in (select id from tree)
    )
    select v.id as version_id, 0 as picked from file_versions v where v.file_id in (select id from tree)
    union all
    select null, count(*)::int from tree where picked
  `);

  await removeContent(
    storage,
    gone.flatMap((row) => (row.version_id === null ? [] : [row.version_id])),
    reportError
  );
  return gone.find((row) => row.version_id === null)?.picked ?? 0;
}
