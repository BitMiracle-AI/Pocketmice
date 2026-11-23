import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';

// Files: what is in a space. This file has seven parts:
// 1. the tree, and how something in it is named and found;
// 2. the content of a file, and its versions;
// 3. the trash, and deleting for good;
// 4. looking for a file by words;
// 5. lists that come a page at a time;
// 6. the address the content goes through, which is not an operation;
// 7. the operations.
//
// 1. The tree. What is in a space is a tree of files and folders, and "a file" here means either: a folder is a file
// of the kind folder. Every file has an id that never changes. Where it is, is the folder it is in (parentId), and
// null means directly in the space: that is how it is written in every input and every output.
// The operations take ids. A path, like /Reports/2026/summary.md, is the names from the top of the space down to the
// file. It is not stored: it is worked out when asked for, so every file in an answer has its path, and
// getFileByPath turns a path into the file. Renaming or moving a folder changes the path of everything in it.
// In one folder a name is used once. Folders nest FOLDER_DEPTH_MAX deep and no deeper.
//
// 2. Content. A file has content, a folder has none. Every write to a file is a new version, and the versions
// before it stay: nothing a person or an agent writes destroys what was there. The version a file points at is its
// content now.
// To write over a file, the caller says which version it is replacing (baseVersionId). When that is no longer the
// current one, somebody else wrote in between, and the answer is CONFLICT: read the file again, then decide. No
// write goes over a version its writer has not seen.
// A version records who wrote it, and through which API key when an agent did. Bringing an old version back
// (restoreFileVersion) adds a version with the same content, so the history only ever grows.
//
// 3. The trash. trashFile does not remove anything: it puts the file in the trash, and what is in a trashed folder
// goes with it. What is in the trash does not exist for any operation but these: getTrashedFiles lists it,
// restoreFile puts it back, and deleteFile and emptyTrash delete it for good. Its name is free while it is there.
// Deleting for good is the one thing here that cannot be undone, so it is for the owner of the space, signed in
// themselves: no API key does it. Whatever anyone else does to the files of a space, a member or an agent, the
// owner can undo.
//
// 4. Looking for a file. Whoever does not know where a file is looks for it by words (getMatchingFiles): the files
// of a space, or of one folder and the folders inside it, that have every one of the words in their name or their
// description. Only what a file is called and how it is described is looked at: not what it holds, and not the
// names of the folders it is in. What is in the trash is not found.
//
// 5. Pages. A list that can grow without limit comes a page at a time: at most limit entries, and nextCursor when
// there are more. Pass nextCursor back as cursor, as it is, to get the next page.
//
// 6. The content address. Bytes do not go through operations, whose inputs and outputs are JSON. They go through
// one address, FILE_CONTENT_PATH: PUT uploads and GET downloads, with what an operation would take as its input
// written in the query. Who may call it is checked the way it is for an operation, and a failure is the same error
// body.

/** What a file is: a file with content, or a folder that holds others */
export const FILE_KINDS = ['file', 'folder'] as const;

export type FileKind = (typeof FILE_KINDS)[number];

export const fileKind = z.enum(FILE_KINDS);

/** The name of a file has at most this many characters */
export const FILE_NAME_MAX_LENGTH = 255;

/**
 * Whether this is a name a file can have: not empty, not too long, not . or .. (which mean something else in a
 * path), and free of / (which separates the names of a path) and of control characters.
 */
function isFileName(name: string): boolean {
  if (name.length === 0 || name.length > FILE_NAME_MAX_LENGTH || name === '.' || name === '..') return false;
  for (const character of name) {
    const code = character.charCodeAt(0);
    if (character === '/' || code < 32 || code === 127) return false;
  }
  return true;
}

/**
 * The name of a file or a folder. Spaces around it are dropped. Names are compared as they are written: Notes and
 * notes are two names.
 */
export const fileName = z
  .string()
  .trim()
  .refine(isFileName, `A name has 1 to ${FILE_NAME_MAX_LENGTH} characters, none of them /, and is not . or ..`);

/**
 * How deep folders nest at most. A folder directly in the space is 1 deep, a folder in it 2, and no folder is deeper
 * than this; a file can be in any of them. Making a folder that would be deeper is refused, and so is moving a
 * folder to where it, or a folder inside it, would be.
 * Nothing real comes near it. It is there because where a file is, is read from the folders it is in, up to the top
 * of the space: with no limit, somebody who may write could put a file so deep that reading where it is costs more
 * than anybody waits for, and it would be out of everybody's reach.
 */
export const FOLDER_DEPTH_MAX = 100;

/** The description of a file has at most this many characters */
export const FILE_DESCRIPTION_MAX_LENGTH = 1024;

/**
 * What a file is, in the words of whoever wrote it down, a person or an agent: what it holds, where it came from,
 * what to do with it. Spaces around it are dropped. Empty means there is none.
 */
export const fileDescription = z.string().trim().max(FILE_DESCRIPTION_MAX_LENGTH);

/** A path has at most this many characters */
export const FILE_PATH_MAX_LENGTH = 4096;

/**
 * The names a path is made of, from the top of the space down. Null when the text is not a path: a path starts
 * with /, the names in it are separated by one / each, every one of them is a name a file can have, and nothing
 * follows the last. So / alone is no path: it would be the space itself, which is not a file.
 */
export function namesOfPath(path: string): string[] | null {
  if (!path.startsWith('/') || path.length > FILE_PATH_MAX_LENGTH) return null;
  const names = path.slice(1).split('/');
  return names.every((name) => name.trim() === name && isFileName(name)) ? names : null;
}

/** The path made of these names, from the top of the space down */
export function pathOfNames(names: readonly string[]): string {
  return `/${names.join('/')}`;
}

/** The path of a file: /Reports/2026/summary.md */
export const filePath = z
  .string()
  .refine((path) => namesOfPath(path) !== null, 'A path is written like /folder/name: it starts with /.');

/** What to look for has at most this many characters: as many as a name, so that a whole name can be looked for */
export const SEARCH_QUERY_MAX_LENGTH = FILE_NAME_MAX_LENGTH;

const QUERY_LENGTH = `What to look for has 1 to ${SEARCH_QUERY_MAX_LENGTH} characters.`;

/**
 * What to look for: one word, or several with spaces between. Spaces around it are dropped.
 * A file matches when every word is in its name or in its description, in capitals or not: one word may be in the
 * name and another in the description. A word is looked for as it is written. No character in it stands for
 * others, and there is no way to say "or" or "not": a few words find more than a sentence does.
 */
export const searchQuery = z.string().trim().min(1, QUERY_LENGTH).max(SEARCH_QUERY_MAX_LENGTH, QUERY_LENGTH);

/**
 * The words of what to look for: what is between its spaces. A space is a space of any kind, a tab or the wide
 * space of Chinese typing as well.
 */
export function wordsOfQuery(query: string): string[] {
  return query.split(/\s+/u).filter((word) => word !== '');
}

/** One content a file has had */
export const fileVersion = z.object({
  id: z.string(),
  /** How many bytes it is */
  size: z.number(),
  /** Its SHA-256, in hex. Two contents with the same one are the same content */
  sha256: z.string(),
  /** When it was written: an ISO 8601 time in UTC */
  createdAt: z.iso.datetime(),
  /** Who wrote it, by the name they go by */
  user: z.object({ id: z.string(), name: z.string() }),
  /** The API key it was written through, when an agent wrote it for that person. Null when they wrote it themselves */
  apiKey: z.object({ id: z.string(), name: z.string() }).nullable()
});

/** A file or a folder, as the members of its space see it */
export const file = z.object({
  id: z.string(),
  /** The folder it is in. Null when it is directly in the space */
  parentId: z.string().nullable(),
  name: z.string(),
  kind: fileKind,
  /** Empty when it has none */
  description: z.string(),
  /** Where it is: the names from the top of the space down to it */
  path: z.string(),
  /** Its content now. Null for a folder */
  version: fileVersion.nullable(),
  /** When it was made: an ISO 8601 time in UTC */
  createdAt: z.iso.datetime(),
  /** When its name, its description, its place or its content last changed */
  updatedAt: z.iso.datetime()
});

/** A file that was put in the trash. Its path is where restoreFile puts it back */
const trashedFile = file.extend({
  /** When it was put there */
  trashedAt: z.iso.datetime()
});

/** A page has at most this many entries, whatever limit asks for */
export const PAGE_SIZE_MAX = 1000;

/** How many entries a page has when limit is left out */
export const PAGE_SIZE_DEFAULT = 100;

/** How many entries to answer with at most */
const limit = z.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT);

/** Where the page before ended: its nextCursor, as it was. Left out for the first page */
const cursor = z.string().optional();

/** What to pass as cursor to get the page after this one. Null when this page is the last */
const nextCursor = z.string().nullable();

/** How the description of an operation that answers with a page says so: the convention, in one sentence */
const PAGED =
  'It comes a page at a time: at most limit entries, and when nextCursor is not null there are more: pass it back ' +
  'as cursor, as it is, to get the next page.';

/**
 * The address the content of files goes through. It is not an operation: what is sent, or answered, is the bytes of
 * a file.
 * PUT uploads. The body is the content, sent with a content-length (not in chunks) and no larger than
 * MAX_FILE_BYTES; the query says what it is (newFileQuery or newVersionQuery). The answer is the file, as getFile
 * answers.
 * GET downloads. The query says which file (contentQuery), and the answer is its bytes, always as a download and
 * never as a page to show. Its etag is the id of the version that was sent. One range of it can be asked for with
 * a Range header; sent with If-Range and that etag, the range is answered only while the file still has that
 * version, and otherwise the whole content is. A HEAD is answered as the GET would be, without the bytes: how
 * large the content is, and which version it is.
 */
export const FILE_CONTENT_PATH = '/api/content';

/** The content of a file has at most this many bytes */
export const MAX_FILE_BYTES = 1024 * 1024 * 1024;

/**
 * What a caller hands to fileContentPath for each of the three queries below. For a new file parentId may be null,
 * which is how every operation says "directly in the space"; in the query itself it is left out.
 */
export type NewFileQuery = Omit<z.input<typeof newFileQuery>, 'parentId'> & { parentId?: string | null };
export type NewVersionQuery = z.input<typeof newVersionQuery>;
export type ContentQuery = z.input<typeof contentQuery>;

/**
 * The address of one request to the content, after the host: FILE_CONTENT_PATH with its query. Every caller builds
 * it here, so that a name is written into a query the one way that is right, and "none" is said the one way a
 * query can say it: a field that is null, or left out, is not written.
 */
export function fileContentPath(query: NewFileQuery | NewVersionQuery | ContentQuery): string {
  const written = new URLSearchParams();
  for (const [field, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) written.set(field, value);
  }
  return `${FILE_CONTENT_PATH}?${written}`;
}

/**
 * The query of an upload that makes a file: in the folder parentId, or directly in the space when parentId is left
 * out. (A query cannot say null, so here leaving it out is how "directly in the space" is said.)
 * NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there.
 */
export const newFileQuery = z.strictObject({ spaceId: id, parentId: id.optional(), name: fileName });

/**
 * The query of an upload that writes over a file: the content becomes a new version, in place of baseVersionId.
 * NOT_FOUND: there is no such file. CONFLICT: baseVersionId is not the current version of the file: somebody wrote
 * to it since the caller read it, or it is a folder, which has no content.
 */
export const newVersionQuery = z.strictObject({ spaceId: id, fileId: id, baseVersionId: id });

/**
 * The query of a download: the content of a file now, or of the version versionId of it.
 * NOT_FOUND: there is no such file, it is a folder, or it has no such version.
 */
export const contentQuery = z.strictObject({ spaceId: id, fileId: id, versionId: id.optional() });

export const createFolder = operation({
  name: 'createFolder',
  description:
    'Makes a folder, in the folder parentId or directly in the space when parentId is null. Answers with the ' +
    'folder. NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there, or the folder would be ' +
    `deeper than folders nest, which is ${FOLDER_DEPTH_MAX} deep.`,
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({
    spaceId: id,
    parentId: id.nullable(),
    name: fileName,
    description: fileDescription.default('')
  }),
  output: z.object({ file }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

export const getFiles = operation({
  name: 'getFiles',
  description:
    'What is in the folder parentId, or directly in the space when parentId is null: files and folders ' +
    'together, in the order of their names. ' +
    PAGED +
    ' NOT_FOUND: there is no folder parentId.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, parentId: id.nullable(), limit, cursor }),
  output: z.object({ files: z.array(file), nextCursor }),
  errors: ['NOT_FOUND']
});

export const getFile = operation({
  name: 'getFile',
  description:
    'One file or folder, by its id: its name, its description, its path, and for a file its content now ' +
    '(version). NOT_FOUND: there is no such file.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, fileId: id }),
  output: z.object({ file }),
  errors: ['NOT_FOUND']
});

export const getFileByPath = operation({
  name: 'getFileByPath',
  description:
    'One file or folder, by its path: the names from the top of the space down to it, like ' +
    '/Reports/2026/summary.md. NOT_FOUND: there is nothing at the path.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, path: filePath }),
  output: z.object({ file }),
  errors: ['NOT_FOUND']
});

export const getMatchingFiles = operation({
  name: 'getMatchingFiles',
  description:
    'Looks for files and folders by words, for when it is not known where something is. query is one word or ' +
    'several with spaces between; a file or a folder matches when every word is in its name or in its ' +
    'description, in capitals or not. One word may be in the name and another in the description. A word is ' +
    'looked for as it is written: no character stands for others, and there is no "or" and no "not", so a few ' +
    'words find more than a sentence does. Only names and descriptions are looked at: not what a file holds, ' +
    'and not the names of the folders it is in. folderId is the folder to look in, together with the folders ' +
    'inside it, or null for the whole space; the folder itself is not among what is found. With kind, only ' +
    'files or only folders. What is in the trash is not found. The latest changed come first. ' +
    PAGED +
    ' Finding nothing is an empty list, not an error. A file that changes while the pages are being read moves ' +
    'to the front, so the pages after may not have it. NOT_FOUND: there is no folder folderId.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({
    spaceId: id,
    folderId: id.nullable(),
    query: searchQuery,
    kind: fileKind.optional(),
    limit,
    cursor
  }),
  output: z.object({ files: z.array(file), nextCursor }),
  errors: ['NOT_FOUND']
});

export const updateFile = operation({
  name: 'updateFile',
  description:
    'Changes the name of a file or a folder, its description, or both: what is left out stays as it is. Where ' +
    'it is does not change; that is moveFile. Answers with the file as it is after the change. NOT_FOUND: ' +
    'there is no such file. CONFLICT: the new name is taken in the folder it is in.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z
    .object({ spaceId: id, fileId: id, name: fileName.optional(), description: fileDescription.optional() })
    .refine(
      (input) => input.name !== undefined || input.description !== undefined,
      'Give a name, a description, or both: there is nothing else to change.'
    ),
  output: z.object({ file }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

export const moveFile = operation({
  name: 'moveFile',
  description:
    'Moves a file or a folder into the folder parentId, or to directly in the space when parentId is null. It ' +
    'keeps its name. Answers with the file as it is after the move. NOT_FOUND: there is no such file, or no ' +
    'folder parentId. CONFLICT: its name is taken there, the folder to move it into is the file itself or ' +
    `inside it, or a folder would end up deeper than folders nest, which is ${FOLDER_DEPTH_MAX} deep.`,
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, fileId: id, parentId: id.nullable() }),
  output: z.object({ file }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

export const trashFile = operation({
  name: 'trashFile',
  description:
    'Puts a file in the trash, and with a folder everything in it. Nothing is removed: restoreFile puts it ' +
    'back. This is as far as deleting goes with an API key: deleting for good is done by the owner of the ' +
    'space, signed in themselves, on what is already in the trash. NOT_FOUND: there is no such file, or it is in ' +
    'the trash already.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, fileId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});

export const restoreFile = operation({
  name: 'restoreFile',
  description:
    'Puts a file that was trashed back where it was, under the name it had. Answers with the file. NOT_FOUND: ' +
    'no such file was put in the trash. A file that is in the trash only because a folder it is in was ' +
    'trashed is not restored on its own: restore the folder. CONFLICT: its name has been taken in the ' +
    'meantime, or the folder it was in is in the trash now.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, fileId: id }),
  output: z.object({ file }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

export const getFileVersions = operation({
  name: 'getFileVersions',
  description:
    'The versions of a file, the latest first: the first is its content now. A folder has none. ' +
    PAGED +
    ' NOT_FOUND: there is no such file.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, fileId: id, limit, cursor }),
  output: z.object({ versions: z.array(fileVersion), nextCursor }),
  errors: ['NOT_FOUND']
});

export const restoreFileVersion = operation({
  name: 'restoreFileVersion',
  description:
    'Makes an old version of a file its content again. The old version is not moved: a new version with the ' +
    'same content is added, written by the caller, in place of baseVersionId, the version that is current ' +
    'now. Answers with the file. Asked to bring back the version that is current already, it changes nothing. ' +
    'NOT_FOUND: there is no such file, or it has no such version. CONFLICT: baseVersionId is not the current ' +
    'version of the file: somebody wrote to it in the meantime.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, fileId: id, versionId: id, baseVersionId: id }),
  output: z.object({ file }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

export const deleteFile = operation({
  name: 'deleteFile',
  description:
    'Deletes for good a file that was put in the trash: every version of it, and with a folder everything in ' +
    'it. Nothing brings it back. NOT_FOUND: no such file was put in the trash. Only what is in the trash is ' +
    'deleted: trash it first.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, fileId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});

export const emptyTrash = operation({
  name: 'emptyTrash',
  description: 'Deletes for good everything in the trash of a space. Nothing brings it back.',
  kind: 'write',
  access: 'session',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id }),
  output: z.object({}),
  errors: []
});

export const getTrashedFiles = operation({
  name: 'getTrashedFiles',
  description:
    'The files that were put in the trash in a space, the latest first. ' +
    PAGED +
    ' What is inside a trashed folder is not listed: it comes back with the folder.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, limit, cursor }),
  output: z.object({ files: z.array(trashedFile), nextCursor }),
  errors: []
});
