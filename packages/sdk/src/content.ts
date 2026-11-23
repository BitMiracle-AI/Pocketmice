import { failureOf, failureOfThrown } from '@pocketmice/client/api';
import {
  type ContentQuery,
  fileContentPath,
  type getFile,
  type NewFileQuery,
  type NewVersionQuery
} from '@pocketmice/contract/domains/file';
import { DECLARED_ERROR_STATUS, type DeclaredErrorCode } from '@pocketmice/contract/errors';
import type { OutputOf } from '@pocketmice/contract/operation';
import { errorOf, PocketmiceError } from './pocketmiceError.ts';

// The content of files: the three methods that are not operations. Bytes do not go through operations. They go
// through one address (FILE_CONTENT_PATH in the contract, where its rules are), and these methods are the requests
// to it. They take what its queries take, and read like the operations in the two places where the address itself
// does not: parentId is null for "directly in the space", and the version a download was is an id, not an etag.

/**
 * What can be uploaded: text (sent as UTF-8), bytes, or a Blob. Each of them says how long it is, and the server
 * takes no upload without a length: that is why a stream is not among them.
 * For a file on disk, Node has openAsBlob (in node:fs). Node still holds much of a large Blob in memory while it is
 * sent: an 800 MB file took about 570 MB, measured once on Node 26.
 */
export type Content = string | Uint8Array | Blob;

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
   * NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there.
   */
  uploadFile: (
    input: Omit<NewFileQuery, 'parentId'> & { parentId: string | null; content: Content }
  ) => Promise<FileAnswer>;
  /**
   * Writes over a file: the content becomes a new version of it, in place of baseVersionId, which is the version
   * the new content was made from. Answers with the file.
   * NOT_FOUND: there is no such file. CONFLICT: baseVersionId is not the current version of the file, because
   * somebody wrote to it since, or the file is a folder. Nothing was written: download it again, then decide.
   */
  uploadFileVersion: (input: NewVersionQuery & { content: Content }) => Promise<FileAnswer>;
  /**
   * The content of a file now, or of the version versionId of it.
   * NOT_FOUND: there is no such file, it is a folder, or it has no such version.
   */
  downloadFile: (input: ContentQuery) => Promise<Download>;
}

/**
 * The codes a request to the content may be refused with, besides the ones any request may: every one this side
 * knows. Which of them the address answers with is written in the contract in words only.
 */
const DECLARED = Object.keys(DECLARED_ERROR_STATUS) as DeclaredErrorCode[];

/** Sends one request as the holder of the key (see pocketmice.ts) */
type Send = (url: string, init: { method: string; body?: BodyInit }) => Promise<Response>;

/** The three methods, sending their requests to the server at baseUrl */
export function contentMethods(baseUrl: string, send: Send): ContentMethods {
  /** Reads the body of an answer. One that breaks off half way is the server not reached */
  async function read<Read>(name: string, body: () => Promise<Read>): Promise<Read> {
    try {
      return await body();
    } catch (thrown) {
      throw errorOf(failureOfThrown(thrown, name), name, thrown);
    }
  }

  /** Sends one request to the content. Returns the answer when it is a success, and throws what it says otherwise */
  async function request(
    name: string,
    query: Parameters<typeof fileContentPath>[0],
    init: { method: string; body?: Content }
  ): Promise<Response> {
    const url = new URL(fileContentPath(query), baseUrl).href;
    let response: Response;
    try {
      // The types of fetch take bytes over a buffer that is not shared only. Content does not ask a caller to say
      // which kind theirs is: a shared one is refused by fetch itself
      response = await send(url, { method: init.method, body: init.body as BodyInit | undefined });
    } catch (thrown) {
      throw errorOf(failureOfThrown(thrown, name), name, thrown);
    }
    if (response.ok) return response;

    const text = await read(name, () => response.text());
    throw errorOf(failureOf(name, response.status, text, DECLARED), name);
  }

  /** The file an upload was answered with */
  async function uploaded(name: string, response: Response): Promise<FileAnswer> {
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
      return uploaded('uploadFile', await request('uploadFile', query, { method: 'PUT', body: content }));
    },

    async uploadFileVersion({ content, ...query }) {
      return uploaded('uploadFileVersion', await request('uploadFileVersion', query, { method: 'PUT', body: content }));
    },

    async downloadFile(query) {
      const response = await request('downloadFile', query, { method: 'GET' });

      // The etag of a download is the id of the version that was sent, in the quotes an etag is written in
      const versionId = /^"(.+)"$/.exec(response.headers.get('etag') ?? '')?.[1];
      if (versionId === undefined) {
        // The bytes are not wanted any more: left unread, they would keep the connection busy
        void response.body?.cancel();
        throw new PocketmiceError(
          'BAD_RESPONSE',
          'The server answered downloadFile without saying which version it sent.',
          'downloadFile'
        );
      }

      return {
        versionId,
        text: () => read('downloadFile', () => response.text()),
        bytes: () => read('downloadFile', async () => new Uint8Array(await response.arrayBuffer())),
        // An answer may come without a body when the content is empty
        body: response.body ?? new Blob([]).stream()
      };
    }
  };
}
