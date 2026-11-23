import { createApiClient, failureOf, failureOfThrown } from '@pocketmice/client/api';
import {
  fileContentPath,
  type getFile,
  getFileDownloadUrl,
  type NewFileQuery,
  type NewVersionQuery
} from '@pocketmice/contract/domains/file';
import { DECLARED_ERROR_STATUS, type DeclaredErrorCode } from '@pocketmice/contract/errors';
import type { InputOf, OutputOf } from '@pocketmice/contract/operation';
import { errorOf, PocketmiceError } from './pocketmiceError.ts';

// The content of files: the three methods that are not operations. Bytes do not go through operations.
// The two that upload are each one request to the address the content is sent to (FILE_CONTENT_PATH in the
// contract, where its rules are). They take what its queries take, and read like the operations in the one place
// where the address itself does not: parentId is null for "directly in the space".
// The one that downloads is two requests, the only method here that is: it asks the operation getFileDownloadUrl
// where the bytes are, and fetches them from the address that answers with. That address is the storage's own,
// not the server's, and holding it is all the storage asks: the API key is not sent there.

/**
 * What can be uploaded: text (sent as UTF-8), bytes, or a Blob. Each of them says how long it is, and the server
 * takes no upload without a length: that is why a stream is not among them.
 * A file on disk is uploaded as the Blob that Node's openAsBlob (in node:fs) gives for it, so that it is not read
 * into memory whole. Node still holds much of it while it is sent: an 800 MB file took about 570 MB.
 */
export type Content = string | Uint8Array | Blob;

/** The size of the pieces content is sent in: the size Node reads the Blob of a file on disk in */
const PIECE_BYTES = 64 * 1024;

/**
 * The content as fetch is given it: a Blob that is read a piece at a time, whatever the content came as, but for
 * the two cases at the end.
 * Node's fetch hands the connection what it reads from a body piece by piece, and content that is in memory is
 * one piece, whatever its size. Sent that way, two things go wrong, both measured on Node 26:
 * - The sending of a piece has five minutes. An upload that takes longer fails with UNREACHABLE, however well it
 *   is going: about 40 MB over a line of 1 Mbit/s is that long.
 * - To a server that is reached over HTTP/2, which Node's fetch speaks whenever the server offers it and a server
 *   behind a proxy usually does, a piece that waits to be sent counts against the 10 MB of memory Node allows a
 *   connection. Above that, Node refuses the answer to every request on the connection: a call made while 20 MB
 *   go up fails, and so does that upload when the server refuses it before taking it, as UNREACHABLE where
 *   CONFLICT was answered. What still waited is never taken off the count, and the connection, which fetch goes
 *   on using, fails every call from then on.
 * In pieces neither happens.
 * What is left: a refused upload still leaves what waited of one piece on the count. Some hundreds of uploads of a
 * MB or more each, refused in one program, end its connection the same way: 250 the first time it was tried, 490
 * to 620 since. While calls go on, they go on failing. Once none had been made for six seconds, the next was
 * answered.
 * Two other runtimes do not take every content that way, both seen with real uploads (Bun 1.4, Deno 2.9):
 * - Bun puts the pieces of a file on disk together as a Blob of no bytes: the file would be stored empty, and
 *   nothing would say so. Where the pieces do not add up to the content, the content goes as it came.
 * - Deno sends a Blob of no bytes without a length, which the server refuses. Content of no bytes goes as text,
 *   which every fetch gives a length. The text is read from it, and not taken to be empty: of a file on disk that
 *   is not there, Bun says that it has no bytes, and only reading it fails. Taken at its word, a path that is
 *   wrong would be stored as an empty file, and nothing would say so.
 */
async function inPieces(content: Content): Promise<Blob | string> {
  // The types of a Blob take bytes over a buffer that is not shared only. Content does not ask a caller to say
  // which kind theirs is, and a Blob copies either
  const whole = content instanceof Blob ? content : new Blob([content as BlobPart]);
  if (whole.size === 0) return whole.text();

  const pieces: Blob[] = [];
  for (let start = 0; start < whole.size; start += PIECE_BYTES) pieces.push(whole.slice(start, start + PIECE_BYTES));
  const together = new Blob(pieces);
  return together.size === whole.size ? together : whole;
}

/** The file an upload answers with, as getFile answers */
type FileAnswer = OutputOf<typeof getFile>;

/** A download: which version it is, and its bytes. The bytes are read once: by text, by bytes, or from body */
export interface Download {
  /** The version that was sent. To write over the file with what was made from this content, name it as baseVersionId */
  versionId: string;
  /** All of it as text: the bytes read as UTF-8 */
  text: () => Promise<string>;
  /** All of it */
  bytes: () => Promise<Uint8Array>;
  /**
   * The bytes as they arrive, for content too large to hold. When the connection breaks half way, the stream fails
   * with what the runtime throws and not with a PocketmiceError: by then downloadFile has returned.
   */
  body: ReadableStream<Uint8Array>;
}

export interface ContentMethods {
  /**
   * Makes a file with this content: in the folder parentId, or directly in the space when parentId is null. Answers
   * with the file.
   * NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there. SPACE_STORAGE_LIMIT_EXCEEDED: the
   * space may not hold this much more (getSpaceSize says how much it holds, and the most it may).
   * MEMBER_STORAGE_LIMIT_EXCEEDED: the space may, and the person the key belongs to may not (getMembers says the
   * same of each member). For both, nothing was written, and only the owner of the space can help.
   * The name answered is the name as it is kept, which may differ byte for byte from the one given: a character
   * that can be written in two ways that look the same is kept one way (NFC), and macOS names its files the other.
   * To compare a name with one from an answer, bring it to NFC first.
   */
  uploadFile: (
    input: Omit<NewFileQuery, 'parentId'> & { parentId: string | null; content: Content }
  ) => Promise<FileAnswer>;
  /**
   * Writes over a file: the content becomes a new version of it, in place of baseVersionId, which is the version
   * the new content was made from. Answers with the file.
   * NOT_FOUND: there is no such file. CONFLICT: baseVersionId is not the current version of the file, because
   * somebody wrote to it since, or the file is a folder. Nothing was written: download it again, then decide.
   * SPACE_STORAGE_LIMIT_EXCEEDED and MEMBER_STORAGE_LIMIT_EXCEEDED: as for uploadFile. The version written over
   * stays, so all of the new content is added to what is held.
   */
  uploadFileVersion: (input: NewVersionQuery & { content: Content }) => Promise<FileAnswer>;
  /**
   * The content of a file now, or of the version versionId of it: versionId is null, or left out, for the content
   * now.
   * NOT_FOUND: there is no such file, it is a folder, or it has no such version. BAD_RESPONSE: the storage did not
   * hand the bytes out at the address the server gave for them.
   */
  downloadFile: (
    input: Omit<InputOf<typeof getFileDownloadUrl>, 'versionId'> & { versionId?: string | null }
  ) => Promise<Download>;
}

/**
 * The codes a request to the content may be refused with, besides the ones any request may: every one this side
 * knows. Which of them the address answers with is written in the contract in words only.
 */
const DECLARED = Object.keys(DECLARED_ERROR_STATUS) as DeclaredErrorCode[];

/** Sends one request as the holder of the key (see pocketmice.ts) */
type Send = (
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: BodyInit; signal?: AbortSignal }
) => Promise<Response>;

/**
 * The three methods, sending their requests to the server at baseUrl. fetchFrom fetches an address that is not the
 * server's, with nothing of the caller sent along: the address the bytes of a download are at.
 */
export function contentMethods(
  baseUrl: string,
  send: Send,
  fetchFrom: (url: string) => Promise<Response>
): ContentMethods {
  // Nothing is recorded here when a call fails unexpectedly: what was thrown is the cause of the error thrown
  const call = createApiClient({ baseUrl, fetch: send, reportError: () => {} });

  /** Reads the body of an answer. One that breaks off half way is the server not reached */
  async function read<Read>(name: string, body: () => Promise<Read>): Promise<Read> {
    try {
      return await body();
    } catch (thrown) {
      throw errorOf(failureOfThrown(thrown, name), name);
    }
  }

  /** Sends one request to the content. Returns the answer when it is a success, and throws what it says otherwise */
  async function request(
    name: string,
    query: Parameters<typeof fileContentPath>[0],
    init: { method: string; body?: Blob | string }
  ): Promise<Response> {
    const url = new URL(fileContentPath(query), baseUrl).href;
    let response: Response;
    try {
      response = await send(url, init);
    } catch (thrown) {
      throw errorOf(failureOfThrown(thrown, name), name);
    }
    if (response.ok) return response;

    const text = await read(name, () => response.text());
    throw errorOf(failureOf(name, response.status, text, DECLARED), name);
  }

  /** Uploads content with the query of a new file or of a new version. Returns the file the server answered with */
  async function upload(name: string, query: NewFileQuery | NewVersionQuery, content: Content): Promise<FileAnswer> {
    // Checked as it arrives and not by its type, for a caller that has no types. What such a caller hands over
    // most easily is a stream, and a Blob made of anything that is not content holds its name: the file would be
    // stored, with the text "[object Object]" for its content
    if (typeof content !== 'string' && !(content instanceof Uint8Array) && !(content instanceof Blob)) {
      throw new PocketmiceError('UNEXPECTED', `What ${name} was given as content is not text, bytes or a Blob.`, name);
    }

    let body: Blob | string;
    try {
      body = await inPieces(content);
    } catch (thrown) {
      throw new PocketmiceError('UNEXPECTED', `The content ${name} was given could not be read.`, name, thrown);
    }

    const response = await request(name, query, { method: 'PUT', body });
    const text = await read(name, () => response.text());
    try {
      // Not checked against the definition, as the output of an operation is not: the server checked it
      return JSON.parse(text);
    } catch {
      throw new PocketmiceError(
        'BAD_RESPONSE',
        `The server answered ${name} with status ${response.status}, but the body is not JSON.`,
        name
      );
    }
  }

  return {
    async uploadFile({ content, ...query }) {
      return upload('uploadFile', query, content);
    },

    async uploadFileVersion({ content, ...query }) {
      return upload('uploadFileVersion', query, content);
    },

    async downloadFile({ versionId: wanted = null, ...file }) {
      const asked = await call(getFileDownloadUrl, { ...file, versionId: wanted });
      if (!asked.ok) throw errorOf(asked, 'downloadFile');
      const { url, version } = asked.data;

      let response: Response;
      try {
        response = await fetchFrom(url);
      } catch (thrown) {
        throw errorOf(failureOfThrown(thrown, 'downloadFile'), 'downloadFile');
      }
      if (!response.ok) {
        // What a storage answers a refusal with is its own, and not the content: it is not handed over, and not
        // read. Letting go of it fails when the connection has already broken, which nobody waits to hear: a
        // failure nobody handles would end the program
        response.body?.cancel().catch(() => {});
        throw new PocketmiceError(
          'BAD_RESPONSE',
          `The storage answered downloadFile with status ${response.status} at the address the server gave.`,
          'downloadFile'
        );
      }
      return {
        versionId: version.id,
        text: () => read('downloadFile', () => response.text()),
        bytes: () => read('downloadFile', async () => new Uint8Array(await response.arrayBuffer())),
        // An answer may come without a body when the content is empty
        body: response.body ?? new Blob([]).stream()
      };
    }
  };
}
