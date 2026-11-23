import {
  FILE_CONTENT_PATH,
  MAX_FILE_BYTES,
  newFileQuery,
  newVersionQuery,
  pathOfNames
} from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import type { Context, Hono } from 'hono';
import type { z } from 'zod';
import type { FileStorage } from '../../external/storage/fileStorage.ts';
import {
  type AdmissionDeps,
  type AdmittedCaller,
  ApiError,
  admitCaller,
  admitMember,
  type CurrentUser,
  describeIssues,
  fail
} from '../../http/operation.ts';
import { assertStorageRoom } from '../space/storageLimit.ts';
import { liveFile, toFile } from './findFile.ts';
import {
  addVersionRow,
  assertCanCreate,
  assertCanReplace,
  createFileRow,
  discardIfRefused,
  type Stored,
  storeContent,
  type Writer
} from './writeContent.ts';

// The address the content of files is uploaded to: a PUT (what it takes is in the contract, at FILE_CONTENT_PATH).
// It is not an operation, because what is sent is bytes and not JSON, and may be large: the bytes are passed on to
// the storage as they come, and never gathered here.
// A download does not come through here, or through the api at all: a caller asks getFileDownloadUrl where the
// bytes are and fetches them from the storage.
// The rules of this address:
// - Who is let in is decided by the same checks as for an operation (admitCaller and admitMember in
//   http/operation.ts): the web page, the sign-in or the API key, what the key may do, the membership and the role.
//   An upload is a write that takes an editor.
// - A failure is the same error body as an operation's, with the same codes.
// - An upload that cannot work is refused before its bytes are taken (see assertCanCreate, assertCanReplace), and
//   so is one that would take the space, or the caller in it, past a storage limit (see assertStorageRoom).

export interface FileContentDeps extends AdmissionDeps {
  db: Db;
  storage: FileStorage;
}

/** Mounts the address on the app */
export function mountFileContent(app: Hono, deps: FileContentDeps): void {
  app.put(FILE_CONTENT_PATH, (c) => refusals(c, () => upload(c, deps)));
}

/** Answers a refusal the way an operation does. Anything else that is thrown is the server failing */
async function refusals(c: Context, answer: () => Promise<Response>): Promise<Response> {
  try {
    return await answer();
  } catch (thrown) {
    if (!(thrown instanceof ApiError)) throw thrown;
    return fail(c, thrown.code, thrown.message);
  }
}

/** The query of the request, checked. INVALID_INPUT when it does not fit */
function readQuery<Schema extends z.ZodType>(c: Context, schema: Schema): z.output<Schema> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) throw new ApiError('INVALID_INPUT', describeIssues(parsed.error.issues));
  return parsed.data;
}

/** The caller, who must be an editor of the space. A Response when they are not let in */
async function admit(
  c: Context,
  caller: AdmittedCaller,
  spaceId: string,
  deps: FileContentDeps
): Promise<CurrentUser | Response> {
  // The address is not public, so whoever got past admitCaller is somebody
  if (!caller.user) throw new Error('The content address was reached without a caller.');
  const member = await admitMember(c, spaceId, 'editor', caller.user, deps);
  return member instanceof Response ? member : caller.user;
}

/**
 * Refuses a body that is too large, by the length the request declares: that what is sent is as long as what was
 * declared is guaranteed by the HTTP server. As with an operation, the body is not touched to find out, and a body
 * sent in chunks, which declares no length, is not accepted.
 * Returns the length declared: how many bytes this upload adds to what is kept.
 */
function assertSize(c: Context): number {
  if (c.req.header('transfer-encoding') !== undefined) {
    throw new ApiError('INVALID_INPUT', 'Send the content with a content-length header, not in chunks.');
  }
  const declared = c.req.header('content-length');
  if (declared === undefined || !/^\d+$/.test(declared)) {
    throw new ApiError('INVALID_INPUT', 'Send the content with a content-length header.');
  }
  if (Number(declared) > MAX_FILE_BYTES) {
    throw new ApiError('INPUT_TOO_LARGE', `The content of a file is at most ${MAX_FILE_BYTES} bytes.`);
  }
  return Number(declared);
}

/** What an upload is to write, read from its query: where it goes, and the two steps that differ between the two kinds */
interface Write {
  spaceId: string;
  /** Refuses a write that cannot work, before its bytes are taken */
  check: () => Promise<void>;
  /** Writes the rows for bytes that are stored. Returns the id of the file */
  commit: (stored: Stored, writer: Writer) => Promise<string>;
}

/** With a fileId in the query the upload writes over that file; without, it makes a file */
function writeOf(c: Context, db: Db): Write {
  if (c.req.query('fileId') === undefined) {
    const query = readQuery(c, newFileQuery);
    const target = { ...query, parentId: query.parentId ?? null };
    return {
      spaceId: target.spaceId,
      check: () => assertCanCreate(db, target),
      commit: (stored, writer) => createFileRow(db, target, stored, writer)
    };
  }
  const target = readQuery(c, newVersionQuery);
  return {
    spaceId: target.spaceId,
    check: () => assertCanReplace(db, target),
    commit: async (stored, writer) => {
      await addVersionRow(db, target, stored, writer);
      return target.fileId;
    }
  };
}

async function upload(c: Context, deps: FileContentDeps): Promise<Response> {
  const size = assertSize(c);
  const caller = await admitCaller(c, { access: 'authenticated', kind: 'write' }, deps);
  if (caller instanceof Response) return caller;
  const write = writeOf(c, deps.db);
  const user = await admit(c, caller, write.spaceId, deps);
  if (user instanceof Response) return user;
  await write.check();
  await assertStorageRoom(deps.db, write.spaceId, user.id, size);

  // A request that says its body has no bytes may come without a body at all: an empty file
  const stored = await storeContent(deps.storage, c.req.raw.body);

  const fileId = await discardIfRefused(deps.storage, stored, deps.reportError, () =>
    write.commit(stored, { userId: user.id, apiKeyId: caller.apiKeyId })
  );

  const found = await liveFile(deps.db, write.spaceId, fileId);
  return c.json({ file: toFile(found.row, pathOfNames(found.names), found.version) }, 200);
}
