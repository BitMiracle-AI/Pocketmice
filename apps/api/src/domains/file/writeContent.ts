import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Db } from '@pocketmice/db';
import { files, fileVersions } from '@pocketmice/db/schema/file';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { ApiError } from '../../http/operation.ts';
import type { FileStorage } from '../../storage/fileStorage.ts';
import { findPlace, liveFile } from './findFile.ts';
import { unlessNameTaken } from './nameTaken.ts';

// Writing content: how a file gets its first version, and every version after it. Uploading and restoring an old
// version both end here.
//
// The order is always the same, and it is what keeps one promise: a version that has a row has its bytes.
// 1. The bytes are stored, under the id the version will have. No row points at them yet.
// 2. One short transaction writes the row of the version and points the file at it. Whether the write is still
//    allowed (the name is free, the version to replace is still the current one) is decided here, by the database.
// 3. If the write is refused in step 2, the bytes stored in step 1 are removed again (see discardIfRefused).
// A process that dies between 1 and 2, or a step 2 that fails without saying whether it was done, leaves bytes that
// no row points at. That is known, and left as it is: they take up room and nothing else, and nothing ever reads
// them.

/** Who is writing: the person, and the API key the request came with when an agent writes for them */
export interface Writer {
  userId: string;
  apiKeyId: string | null;
}

/** Bytes that are in the storage, with what was measured as they went in */
export interface Stored {
  /** The id of the version they are for, which is also their key in the storage */
  versionId: string;
  size: number;
  sha256: string;
}

/** Where a new file goes */
export interface NewFile {
  spaceId: string;
  /** Null for directly in the space */
  parentId: string | null;
  name: string;
}

/** Which file gets a new version, and which version that replaces */
export interface NewVersion {
  spaceId: string;
  fileId: string;
  baseVersionId: string;
}

/**
 * Stores the body of a request as the bytes of a new version, measuring them on the way: nothing is kept in memory,
 * however large the content is. No body at all is content of no bytes.
 * INVALID_INPUT when the body broke off: the caller's connection went away before all of it arrived. Any other
 * failure is the storage's, and is thrown on as it is.
 */
export async function storeContent(storage: FileStorage, body: ReadableStream<Uint8Array> | null): Promise<Stored> {
  const versionId = randomUUID();
  const hash = createHash('sha256');
  let size = 0;
  let brokeOff = false;
  // What the storage reads: the caller's bytes, measured as it takes them. It is one chain and the storage pulls
  // it, so nothing is read from the caller that the storage did not ask for, and a storage that fails ends it.
  // (Its failure may reach here only once the read from the caller that is under way has ended: with their next
  // bytes, or when their connection goes.)
  async function* measured() {
    const reader = body?.getReader();
    if (!reader) return;
    for (;;) {
      // The one step that fails when the caller goes away, which is how that is told from the storage failing
      const { done, value } = await reader.read().catch((error: unknown) => {
        brokeOff = true;
        throw error;
      });
      if (done) return;
      hash.update(value);
      size += value.length;
      yield value;
    }
  }

  try {
    await storage.put(versionId, Readable.from(measured(), { objectMode: false }));
  } catch (error) {
    if (brokeOff) throw new ApiError('INVALID_INPUT', 'The upload broke off before all of it arrived.');
    throw error;
  }

  return { versionId, size, sha256: hash.digest('hex') };
}

/**
 * Removes the bytes of versions that are gone, or did not come to be. A failure is reported and goes no further:
 * what the caller asked for is decided already, and bytes left behind take up room and nothing else.
 */
export async function removeContent(
  storage: FileStorage,
  versionIds: string[],
  reportError: (error: unknown, where: string) => void
): Promise<void> {
  if (versionIds.length === 0) return;
  try {
    await storage.delete(versionIds);
  } catch (error) {
    reportError(error, 'removeContent');
  }
}

/**
 * Runs the step that writes the rows for bytes that are stored (createFileRow, addVersionRow).
 * When the step is refused, the bytes are removed again: no row points at them, and none will.
 * When it fails any other way, they stay. A lost connection, or a statement that ran out of time, does not say
 * whether the rows were written: bytes left behind without a row take up room, while bytes removed from under a
 * row would be a version that has lost its content.
 */
export async function discardIfRefused<Result>(
  storage: FileStorage,
  stored: Stored,
  reportError: (error: unknown, where: string) => void,
  write: () => Promise<Result>
): Promise<Result> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof ApiError) await removeContent(storage, [stored.versionId], reportError);
    throw error;
  }
}

/**
 * Whether a file can be made at this place under this name now.
 * NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there.
 * Asked before the bytes are taken, so that a write that cannot work is refused without them. It decides nothing:
 * the name can be taken while the bytes arrive, and then the database refuses the row (see createFileRow).
 */
export async function assertCanCreate(db: Db, target: NewFile): Promise<void> {
  await findPlace(db, target.spaceId, target.parentId);
  const [taken] = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.spaceId, target.spaceId),
        target.parentId === null ? isNull(files.parentId) : eq(files.parentId, target.parentId),
        eq(files.name, target.name),
        isNull(files.deletedAt)
      )
    );
  if (taken) throw new ApiError('CONFLICT', `The name "${target.name}" is taken in that folder.`);
}

/**
 * Whether a file can be given a new version in place of baseVersionId now.
 * NOT_FOUND: there is no such file. CONFLICT: it is a folder, or baseVersionId is not its current version.
 * Asked before the bytes are taken, like assertCanCreate, and again when the row is written (see addVersionRow).
 */
export async function assertCanReplace(db: Db, target: NewVersion): Promise<void> {
  const found = await liveFile(db, target.spaceId, target.fileId);
  if (found.row.kind !== 'file') throw new ApiError('CONFLICT', 'A folder has no content to write over.');
  if (found.row.versionId !== target.baseVersionId) throw staleBase(target);
}

function staleBase(target: NewVersion): ApiError {
  return new ApiError(
    'CONFLICT',
    `Version ${target.baseVersionId} is not the current version of file ${target.fileId}: it was written to since. Read the file again.`
  );
}

/**
 * Makes a file out of stored bytes. Returns its id.
 * NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there.
 */
export async function createFileRow(db: Db, target: NewFile, stored: Stored, writer: Writer): Promise<string> {
  // Asked again here, after the bytes went in: an upload can take minutes, and the folder may have been trashed
  // meanwhile
  await findPlace(db, target.spaceId, target.parentId);

  const fileId = randomUUID();
  // One statement writes both rows. A file must have a version and a version must have a file (see the files
  // table), so neither can be written first; inside one statement the database checks both at its end
  await unlessNameTaken(target.name, () =>
    db.execute(sql`
      with new_file as (
        insert into ${files} (id, space_id, parent_id, name, kind, version_id, user_id)
        values (${fileId}, ${target.spaceId}, ${target.parentId}, ${target.name}, 'file', ${stored.versionId},
                ${writer.userId})
      )
      insert into ${fileVersions} (id, file_id, size, sha256, user_id, key_id)
      values (${stored.versionId}, ${fileId}, ${stored.size}, ${stored.sha256}, ${writer.userId}, ${writer.apiKeyId})
    `)
  );
  return fileId;
}

/**
 * Makes stored bytes the new version of a file, in place of baseVersionId.
 * NOT_FOUND: there is no such file. CONFLICT: it is a folder, or baseVersionId is not its current version.
 */
export async function addVersionRow(db: Db, target: NewVersion, stored: Stored, writer: Writer): Promise<void> {
  // Asked again, after the bytes went in: the file may have been trashed meanwhile
  await assertCanReplace(db, target);

  await db.transaction(async (tx) => {
    // The row is locked at the version the caller says it is replacing. Of two writers who both read that version,
    // one gets the lock and moves the pointer; the other then finds no row at that version, and is refused. This is
    // the line that keeps anyone from writing over a version they have not seen
    const [held] = await tx
      .select({ id: files.id })
      .from(files)
      .where(
        and(eq(files.spaceId, target.spaceId), eq(files.id, target.fileId), eq(files.versionId, target.baseVersionId))
      )
      .for('update');
    if (!held) throw staleBase(target);

    await tx.insert(fileVersions).values({
      id: stored.versionId,
      fileId: target.fileId,
      size: stored.size,
      sha256: stored.sha256,
      userId: writer.userId,
      keyId: writer.apiKeyId
    });
    await tx.update(files).set({ versionId: stored.versionId }).where(eq(files.id, target.fileId));
  });
}
