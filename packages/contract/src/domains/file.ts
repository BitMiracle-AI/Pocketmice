import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';

// Files: what is in a space. This file has four parts:
// 1. the tree, and how something in it is named and found;
// 2. the trash;
// 3. lists that come a page at a time;
// 4. the operations.
//
// 1. The tree. What is in a space is a tree of files and folders, and "a file" here means either: a folder is a file
// of the kind folder. Every file has an id that never changes. Where it is, is the folder it is in (parentId), and
// null means directly in the space: that is how it is written in every input and every output.
// The operations take ids. A path, like /Reports/2026/summary.md, is the names from the top of the space down to the
// file. It is not stored: it is worked out when asked for, so every file in an answer has its path, and
// getFileByPath turns a path into the file. Renaming or moving a folder changes the path of everything in it.
// In one folder a name is used once.
// So far only folders can be made. A file gets its content by being uploaded, which is not here yet.
//
// 2. The trash. trashFile does not remove anything: it puts the file in the trash, and what is in a trashed folder
// goes with it. What is in the trash does not exist for any operation but two: getTrashedFiles lists it, and
// restoreFile puts it back. Its name is free while it is there.
//
// 3. Pages. A list that can grow without limit comes a page at a time: at most limit files, and nextCursor when
// there are more. Pass nextCursor back as cursor, as it is, to get the next page.

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
  /** When it was made: an ISO 8601 time in UTC */
  createdAt: z.iso.datetime(),
  /** When its name, its description or its place last changed */
  updatedAt: z.iso.datetime()
});

/** A file that was put in the trash. Its path is where restoreFile puts it back */
const trashedFile = file.extend({
  /** When it was put there */
  trashedAt: z.iso.datetime()
});

/** A page has at most this many files, whatever limit asks for */
export const PAGE_SIZE_MAX = 1000;

/** How many files a page has when limit is left out */
export const PAGE_SIZE_DEFAULT = 100;

/** How many files to answer with at most */
const limit = z.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT);

/** Where the page before ended: its nextCursor, as it was. Left out for the first page */
const cursor = z.string().optional();

/** What to pass as cursor to get the page after this one. Null when this page is the last */
const nextCursor = z.string().nullable();

/**
 * Makes a folder, in the folder parentId or directly in the space.
 * NOT_FOUND: there is no folder parentId. CONFLICT: the name is taken there.
 */
export const createFolder = operation({
  name: 'createFolder',
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

/**
 * What is in the folder parentId, or directly in the space, in the order of the names. A page at a time.
 * NOT_FOUND: there is no folder parentId.
 */
export const getFiles = operation({
  name: 'getFiles',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, parentId: id.nullable(), limit, cursor }),
  output: z.object({ files: z.array(file), nextCursor }),
  errors: ['NOT_FOUND']
});

/** One file, by its id. NOT_FOUND: there is no such file */
export const getFile = operation({
  name: 'getFile',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, fileId: id }),
  output: z.object({ file }),
  errors: ['NOT_FOUND']
});

/** One file, by its path. NOT_FOUND: there is nothing at the path */
export const getFileByPath = operation({
  name: 'getFileByPath',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, path: filePath }),
  output: z.object({ file }),
  errors: ['NOT_FOUND']
});

/**
 * Changes the name of a file, its description, or both: what is left out stays as it is. Where the file is does not
 * change; that is moveFile. Answers with the file as it is after the change.
 * NOT_FOUND: there is no such file. CONFLICT: the new name is taken in the folder it is in.
 */
export const updateFile = operation({
  name: 'updateFile',
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

/**
 * Moves a file into the folder parentId, or to directly in the space. It keeps its name. Answers with the file as
 * it is after the move.
 * NOT_FOUND: there is no such file, or no folder parentId. CONFLICT: its name is taken there, or the folder to move
 * it into is the file itself or inside it.
 */
export const moveFile = operation({
  name: 'moveFile',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, fileId: id, parentId: id.nullable() }),
  output: z.object({ file }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

/**
 * Puts a file in the trash, and with a folder everything in it. Nothing is removed: restoreFile puts it back.
 * NOT_FOUND: there is no such file, or it is in the trash already.
 */
export const trashFile = operation({
  name: 'trashFile',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, fileId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});

/**
 * Puts a file that was trashed back where it was, under the name it had. Answers with the file.
 * NOT_FOUND: no such file was put in the trash. A file that is in the trash only because a folder it is in was
 * trashed is not restored on its own: restore the folder.
 * CONFLICT: its name has been taken in the meantime, or the folder it was in is in the trash now.
 */
export const restoreFile = operation({
  name: 'restoreFile',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'editor',
  input: z.object({ spaceId: id, fileId: id }),
  output: z.object({ file }),
  errors: ['NOT_FOUND', 'CONFLICT']
});

/**
 * The files that were put in the trash in a space, the latest first. A page at a time.
 * What is inside a trashed folder is not listed: it comes back with the folder.
 */
export const getTrashedFiles = operation({
  name: 'getTrashedFiles',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, limit, cursor }),
  output: z.object({ files: z.array(trashedFile), nextCursor }),
  errors: []
});
