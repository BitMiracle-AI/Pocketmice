import { getFileSize as definition } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { liveFile } from './findFile.ts';

// How much a file or a folder holds: the sizes of the versions under it, added up when it is asked for.
// Like what a space holds (see storageLimit.ts in domains/space), it is written nowhere. A number kept on every
// folder would say what the versions say a second time, and every write, every move, every trip to the trash and
// back would have to put it right on each folder above.
// So it costs as much as there is under the folder. Measured in a database of three million versions, on a folder
// of 100 files: 1 ms; of 10,000 files in 100 folders: 0.13 s; of a million files in 10,000 folders: 14 s. That
// last one is known and left as it is: the answer is asked for by itself, of one folder, by whoever wants it.
// The versions are looked up file by file, each through the index on its file. Joining the files under the folder
// to the versions reads better and must not be written: the database cannot tell how many files a walk will find,
// takes it for many, and reads the whole table of versions, those of every other space too. That took 0.3 s for
// the folder of 100 files, and grows with what everybody else keeps.
// An index that holds the sizes next to the files made the lookups a third faster and is a third of the size of
// the table: it is not there.

export function getFileSize({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    // NOT_FOUND for what is not there, and for what is in the trash
    await liveFile(db, input.spaceId, input.fileId);

    // Down from the file, leaving out what was put in the trash and so everything below it. A file is the walk
    // of one row. The walk needs no limit on its depth: the file reaches the top of the space (liveFile found
    // it), so nothing reached from it is in a loop
    const [held] = await db.execute<{ bytes: string }>(sql`
      with recursive tree as (
        select f.id, f.kind from files f where f.space_id = ${input.spaceId} and f.id = ${input.fileId}
        union all
        select c.id, c.kind from tree join files c on c.parent_id = tree.id where c.deleted_at is null
      )
      select coalesce(sum(each.bytes), 0) as bytes
      from tree
      cross join lateral (select sum(v.size) as bytes from file_versions v where v.file_id = tree.id) each
      where tree.kind = 'file'
    `);

    // A sum of sizes comes as text: it is a number of bytes, far below where a number stops being exact
    return { storageSize: Number(held?.bytes ?? 0) };
  });
}
