import { Readable } from 'node:stream';
import {
  contentQuery,
  FILE_CONTENT_PATH,
  MAX_FILE_BYTES,
  newFileQuery,
  newVersionQuery,
  pathOfNames
} from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { fileVersions } from '@pocketmice/db/schema/file';
import { and, eq } from 'drizzle-orm';
import type { Context, Hono } from 'hono';
import type { z } from 'zod';
import type { ByteRange, FileStorage } from '../../external/storage/fileStorage.ts';
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

// The address the content of files goes through: PUT uploads, GET downloads (what each takes is in the contract,
// at FILE_CONTENT_PATH). It is not an operation, because what is sent or answered is bytes and not JSON, and may be
// large: the bytes are passed on as they come, between the caller and the storage, and never gathered here.
// The rules of this address:
// - Who is let in is decided by the same checks as for an operation (admitCaller and admitMember in
//   http/operation.ts): the web page, the sign-in or the API key, what the key may do, the membership and the role.
//   An upload is a write that takes an editor; a download is a read that takes a viewer.
// - A failure is the same error body as an operation's, with the same codes.
// - An upload that cannot work is refused before its bytes are taken (see assertCanCreate, assertCanReplace), and
//   so is one that would take the space, or the caller in it, past a storage limit (see assertStorageRoom).
// - A download is always answered as a file to save, never as a page to show: content somebody uploaded must not
//   run as a page of this address, where it would act as whoever opened it. The etag is the id of the version that
//   was sent, which is what a caller that downloaded "the content now" needs in order to write over it.

export interface FileContentDeps extends AdmissionDeps {
  db: Db;
  storage: FileStorage;
}

/** Mounts the address on the app */
export function mountFileContent(app: Hono, deps: FileContentDeps): void {
  app.put(FILE_CONTENT_PATH, (c) => refusals(c, () => upload(c, deps)));
  app.get(FILE_CONTENT_PATH, (c) => refusals(c, () => download(c, deps)));
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

/** The caller, who must be a member of the space in this role. A Response when they are not let in */
async function admit(
  c: Context,
  caller: AdmittedCaller,
  spaceId: string,
  minRole: 'viewer' | 'editor',
  deps: FileContentDeps
): Promise<CurrentUser | Response> {
  // The address is not public, so whoever got past admitCaller is somebody
  if (!caller.user) throw new Error('The content address was reached without a caller.');
  const member = await admitMember(c, spaceId, minRole, caller.user, deps);
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
  const user = await admit(c, caller, write.spaceId, 'editor', deps);
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

/**
 * The range a Range header asks for, of content that is size bytes. Null when there is no header, or it is not one
 * this address serves: then the whole content is sent, which a server may always do. 'none' when the range is well
 * written and has nothing of the content in it.
 * One range is served, written in one of the three ways: from a byte to a byte, from a byte to the end, or the
 * last so many bytes.
 */
export function rangeOf(header: string | undefined, size: number): ByteRange | 'none' | null {
  const parts = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!parts || (parts[1] === '' && parts[2] === '')) return null;

  if (parts[1] === '') {
    const last = Number(parts[2]);
    return last === 0 || size === 0 ? 'none' : { start: Math.max(size - last, 0), end: size - 1 };
  }
  const start = Number(parts[1]);
  const end = parts[2] === '' ? size - 1 : Math.min(Number(parts[2]), size - 1);
  return start >= size || end < start ? 'none' : { start, end };
}

/**
 * The name of a file as the header that names a download carries it: the way that holds any character (RFC 5987),
 * since a name may be in any script.
 * encodeURIComponent leaves four characters as they are that this way of writing does not allow: ' ( ) *. They are
 * written out too. Left as it is, a ' ends the name early for a browser: Chrome then drops the whole name, and
 * "it's done.md" is saved as "content".
 */
function headerName(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

async function download(c: Context, deps: FileContentDeps): Promise<Response> {
  const caller = await admitCaller(c, { access: 'authenticated', kind: 'read' }, deps);
  if (caller instanceof Response) return caller;
  const query = readQuery(c, contentQuery);
  const user = await admit(c, caller, query.spaceId, 'viewer', deps);
  if (user instanceof Response) return user;

  const found = await liveFile(deps.db, query.spaceId, query.fileId);
  if (!found.version) throw new ApiError('NOT_FOUND', `File ${query.fileId} is a folder: it has no content.`);
  let { id: versionId, size } = found.version;
  if (query.versionId !== undefined && query.versionId !== versionId) {
    const [version] = await deps.db
      .select({ id: fileVersions.id, size: fileVersions.size })
      .from(fileVersions)
      .where(and(eq(fileVersions.fileId, query.fileId), eq(fileVersions.id, query.versionId)));
    if (!version) throw new ApiError('NOT_FOUND', `File ${query.fileId} has no version ${query.versionId}.`);
    ({ id: versionId, size } = version);
  }

  const etag = `"${versionId}"`;
  const headers: Record<string, string> = {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${headerName(found.row.name)}`,
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    etag,
    // Who may read it is asked on every request, so no cache in between keeps it for someone else
    'cache-control': 'private, no-cache'
  };

  // A caller that goes on with a download it began earlier says which version it has the beginning of (If-Range).
  // When that is not the version being sent, a range of this one would be glued onto the other: the whole content
  // is sent instead
  const began = c.req.header('if-range');
  const range = began === undefined || began === etag ? rangeOf(c.req.header('range'), size) : null;
  if (range === 'none') {
    // The one answer here that is not an error code of ours: it is HTTP's own answer to a Range header. It says
    // which version has nothing there and how large that version is, so a caller learns both from one answer
    return c.json(
      { error: { code: 'INVALID_INPUT', message: `The range asked for has nothing of the ${size} bytes in it.` } },
      416,
      { 'content-range': `bytes */${size}`, etag }
    );
  }
  const status = range ? 206 : 200;
  if (range) {
    headers['content-length'] = String(range.end - range.start + 1);
    headers['content-range'] = `bytes ${range.start}-${range.end}/${size}`;
  } else {
    headers['content-length'] = String(size);
  }

  // A HEAD asks for what a GET would be answered with, without the bytes, and the app hands it to this same
  // function. The bytes are not fetched for it: a stream that is fetched has to be read to its end or closed, and
  // the body of an answer to a HEAD is neither
  if (c.req.method === 'HEAD') return c.body(null, status, headers);

  // A version that has a row has its bytes. If the storage has none, the server has lost them: that is thrown on
  // as it is, and answered as an internal error
  const bytes = await deps.storage.get(versionId, range ?? undefined);
  return c.body(Readable.toWeb(bytes) as ReadableStream, status, headers);
}
