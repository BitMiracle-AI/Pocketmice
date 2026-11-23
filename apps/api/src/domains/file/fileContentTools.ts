import {
  FILE_CONTENT_PATH,
  fileContentPath,
  fileName,
  type NewFileQuery,
  type NewVersionQuery
} from '@pocketmice/contract/domains/file';
import { id } from '@pocketmice/contract/id';
import { z } from 'zod';
import { answer, failure, refusal, type Send, type Tool, type ToolResult, tool } from '../../http/mcp.ts';

// The tools of the MCP entrance for the content of files (the entrance and its rules are in http/mcp.ts). They are
// not operations: the content of a file does not go through an operation, it goes through the content address, as
// bytes (see fileContent.ts). A model reads and writes text, so these three stand between the two: each sends a
// request to the content address as the caller of the tool, and what that address refuses, the tool refuses.
// They exist at the MCP entrance only. Over HTTP the content has one way in and out, the content address.
// What they add to it:
// - Text only. What is read is given to the model as text and what the model writes is text, so content that is
//   not UTF-8 is not read here: it is downloaded from the content address.
// - A long text is read a piece at a time, since what a tool answers with is all put before the model. The cursor
//   that reads on names the version the pieces are of, so they are always pieces of one content, whoever wrote to
//   the file in between.
// - A write sends the whole text: there is no changing a part of it.

/**
 * One call reads at most this many bytes of a text. A client puts all of an answer before its model and has a
 * limit on how long that may be; Claude Code's is 25,000 tokens. This much text stays under it in any script.
 */
export const MAX_TEXT_READ_BYTES = 32 * 1024;

/**
 * The cursor of a read: the version being read and the byte to read on from, as nextCursorOf writes them. The byte
 * is a number that can be written out in digits: one too long for that is no place in any file.
 */
const CURSOR = /^([0-9a-f-]{36}):(\d{1,15})$/;

function nextCursorOf(versionId: string, from: number): string {
  return `${versionId}:${from}`;
}

/**
 * How many of these bytes, from the start, are whole characters of UTF-8. Reading a text a piece at a time cuts it
 * wherever the piece ends, which may be in the middle of a character: those last bytes are left for the next piece.
 */
export function wholeCharacters(bytes: Uint8Array): number {
  // The start of the last character is at most three bytes before the end
  for (let back = 1; back <= Math.min(4, bytes.length); back++) {
    const byte = bytes[bytes.length - back] ?? 0;
    // A byte that continues a character: its start is further back
    if ((byte & 0b1100_0000) === 0b1000_0000) continue;
    const length = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
    return length > back ? bytes.length - back : bytes.length;
  }
  return bytes.length;
}

/** The address of the content of a file: of this version of it, or of its content now when version is null */
function contentAddress(spaceId: string, fileId: string, version: string | null): string {
  return fileContentPath({ spaceId, fileId, ...(version !== null && { versionId: version }) });
}

/** What a read answers with: about the content first, as JSON, and then the text itself when there is any */
function piece(about: { versionId: string; size: number; nextCursor: string | null }, text: string): ToolResult {
  const { content } = answer(about);
  // A part with no text in it is left out: some clients refuse an answer that has one
  return { content: text === '' ? content : [...content, { type: 'text', text }] };
}

const getFileContent = tool({
  name: 'getFileContent',
  description:
    'The content of a file, as text: of the version versionId, or its content now when versionId is null. Answers ' +
    'with which version was read (versionId), how many bytes all of it is (size) and nextCursor, and after that ' +
    'with the text itself, in a part of its own. When the content now was read, that versionId is the ' +
    'baseVersionId to write over the file with. A long text comes a piece at a time: when nextCursor is not null ' +
    'there is more, and passing it back as cursor, as it is, reads on, in the same version even if the file was ' +
    'written to since. A piece ends between two characters, and may end in the middle of a line: the pieces put ' +
    'end to end are the text. Only text is read this way: content that is not UTF-8 is refused, and is downloaded ' +
    `from ${FILE_CONTENT_PATH}. NOT_FOUND: there is no such file, it is a folder, or it has no such version.`,
  kind: 'read',
  input: z.object({ spaceId: id, fileId: id, versionId: id.nullable(), cursor: z.string().optional() }),
  run: async ({ spaceId, fileId, versionId, cursor }, send) => {
    let version = versionId;
    let from = 0;
    if (cursor !== undefined) {
      const at = CURSOR.exec(cursor);
      if (!at?.[1]) return failure('INVALID_INPUT: cursor: pass the nextCursor of the answer before, as it was.');
      version = at[1];
      from = Number(at[2]);
    }

    const address = contentAddress(spaceId, fileId, version);
    const response = await send(address, { headers: { range: `bytes=${from}-${from + MAX_TEXT_READ_BYTES - 1}` } });

    // 416: nothing of the content is at that byte or after it. The content is empty, or the cursor is at its end
    const nothingThere = response.status === 416;
    if (!response.ok && !nothingThere) return refusal(response);

    // Either answer says which version it is about (the etag is its id, in quotes) and how large that version is:
    // the two are of one moment, whoever writes to the file in the next
    const versionRead = response.headers.get('etag')?.replaceAll('"', '');
    const size = Number(response.headers.get('content-range')?.split('/')[1]);
    // Only a piece is taken. The content address may answer a range with all of the content, which is up to a
    // gigabyte: an answer that is not a piece (206) is not read
    if ((response.status !== 206 && !nothingThere) || !versionRead || !Number.isInteger(size)) {
      await response.body?.cancel();
      throw new Error(`The content address answered a range with ${response.status}, and not with a piece.`);
    }
    // What a 416 carries is its refusal, and none of the content
    if (nothingThere) await response.body?.cancel();
    const bytes = nothingThere ? new Uint8Array() : new Uint8Array(await response.arrayBuffer());

    const last = from + bytes.length >= size;
    const whole = last ? bytes.length : wholeCharacters(bytes);
    let text: string;
    try {
      // fatal: bytes that are not UTF-8 throw, and are not turned into replacement characters without a word.
      // ignoreBOM: a byte order mark is kept, as the character it is: what is read is what is there
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, whole));
    } catch {
      return failure(
        `This content is not text: it is ${size} bytes that are not UTF-8, which cannot be read here. Download it: ` +
          `GET ${contentAddress(spaceId, fileId, versionRead)} with the same API key.`
      );
    }

    return piece(
      { versionId: versionRead, size, nextCursor: last ? null : nextCursorOf(versionRead, from + whole) },
      text
    );
  }
});

/** Uploads a text to the content address, where query says what it is. Answers the way the address does */
async function upload(send: Send, query: NewFileQuery | NewVersionQuery, content: string): Promise<ToolResult> {
  const bytes = new TextEncoder().encode(content);
  const response = await send(fileContentPath(query), {
    method: 'PUT',
    headers: { 'content-length': String(bytes.length) },
    body: bytes
  });
  return response.ok ? answer(await response.json()) : refusal(response);
}

const createFile = tool({
  name: 'createFile',
  description:
    'Makes a file with this text as its content, in the folder parentId or directly in the space when parentId is ' +
    `null. Answers with the file. Only text is written this way: anything else is uploaded to ${FILE_CONTENT_PATH}. ` +
    'NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there.',
  kind: 'write',
  input: z.object({ spaceId: id, parentId: id.nullable(), name: fileName, content: z.string() }),
  run: ({ spaceId, parentId, name, content }, send) => upload(send, { spaceId, parentId, name }, content)
});

const updateFileContent = tool({
  name: 'updateFileContent',
  description:
    'Writes over a file: this text becomes its content, as a new version in place of baseVersionId, the version ' +
    'that is current now (version.id of the file, which is what getFileContent answers as versionId when it reads ' +
    'the content now). The versions before it stay. The text replaces all of the content, so send all of it. ' +
    'Answers with the file. NOT_FOUND: there is no such file. CONFLICT: baseVersionId is not the current version ' +
    'of the file: somebody wrote to it since it was read, or it is a folder. Read it again, then decide.',
  kind: 'write',
  input: z.object({ spaceId: id, fileId: id, baseVersionId: id, content: z.string() }),
  run: ({ spaceId, fileId, baseVersionId, content }, send) => upload(send, { spaceId, fileId, baseVersionId }, content)
});

/** The tools of the MCP entrance for the content of files */
export const fileContentTools: Tool[] = [getFileContent, createFile, updateFileContent];
