import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { apiKeys } from './apiKey.ts';
import { users } from './auth.ts';
import { spaces } from './space.ts';

/** What a row of files is: a file, or a folder that holds others. The contract lists the same two */
export const FILE_KINDS = ['file', 'folder'] as const;

/**
 * What is in the spaces: a tree in each. A file and a folder are both a row here, told apart by kind.
 * Where a row sits is its parent, and its path is the names from the top of the space down to it. The path is
 * stored nowhere: renaming or moving a folder changes one row, and everything in it follows.
 * The id of a row never changes, whatever its name and its place become.
 * What a file holds is not here: the content is a version (fileVersions below), and the row points at the one that
 * is current.
 */
export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** The space it is in. That never changes */
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    /** The folder it is in. Null when it is directly in the space */
    parentId: uuid('parent_id'),
    /** Its name. Among what is in one folder and not in the trash, a name is used once (see the indexes below) */
    name: text('name').notNull(),
    kind: text('kind', { enum: FILE_KINDS }).notNull(),
    /** What it is, in the words of whoever wrote it down: a person or an agent. Empty when nobody has */
    description: text('description').notNull().default(''),
    /**
     * The version that is the content of the file now. A file always has one, and a folder never: the check below
     * says so, which is why a file and its first version are written in one statement (see writeContent.ts in
     * the api).
     */
    versionId: uuid('version_id'),
    /** Who made it. As with a space, the database refuses to delete a user who made one */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * When it was put in the trash. Null for one that was not.
     * Only the row that was trashed is marked. What is in a trashed folder is in the trash with it, and its rows
     * say nothing of that: whether something is in the trash is read from the folders it is in, up to the top.
     * Kept to the millisecond, which is as fine as the time is written in a cursor (see cursor.ts in the api): a
     * finer time would not come back from a cursor as it was.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  (table) => [
    // Exists for the foreign key below, which has to point at something unique
    unique('files_space_id_id_unique').on(table.spaceId, table.id),
    // The folder a row is in is a row of the same space: the database refuses a tree that reaches into another
    // space, whatever the code that writes parents does. A row directly in the space has no parent and is not
    // checked
    foreignKey({
      name: 'files_parent_fk',
      columns: [table.spaceId, table.parentId],
      foreignColumns: [table.spaceId, table.id]
    }),
    // A name is used once among what is in one place and not in the trash. Two indexes, because the place is
    // written in two ways: no parent for directly in the space, a parent for in a folder. Both also serve
    // "what is in this place, by name".
    // What is in the trash is left out, so trashing something frees its name
    uniqueIndex('files_top_name_idx')
      .on(table.spaceId, table.name)
      .where(sql`${table.parentId} is null and ${table.deletedAt} is null`),
    uniqueIndex('files_folder_name_idx')
      .on(table.parentId, table.name)
      .where(sql`${table.parentId} is not null and ${table.deletedAt} is null`),
    // "What was put in the trash in this space, the latest first"
    index('files_trash_idx').on(table.spaceId, table.deletedAt).where(sql`${table.deletedAt} is not null`),
    // A file has content and a folder has none
    check('files_content_check', sql`(${table.kind} = 'file') = (${table.versionId} is not null)`),
    // The current version of a file is a version of that file, and of no other
    foreignKey({
      name: 'files_version_fk',
      columns: [table.id, table.versionId],
      foreignColumns: [fileVersions.fileId, fileVersions.id]
    })
  ]
);

/**
 * The versions of the files: every content a file has had. Writing to a file adds a row here and moves the file's
 * pointer to it; a row never changes, and the versions before it stay.
 * The bytes are not in the database. They are in the storage, one object for each row, under the id of the row. A
 * row is written only after its bytes are stored, and bytes are removed only after their row is: a row always has
 * its content.
 */
export const fileVersions = pgTable(
  'file_versions',
  {
    /** Also the name of the object in the storage that holds the bytes */
    id: uuid('id').primaryKey(),
    /** The file it is a version of. A version goes when its file is deleted for good */
    fileId: uuid('file_id')
      .notNull()
      .references((): AnyPgColumn => files.id, { onDelete: 'cascade' }),
    /** How many bytes the content is */
    size: bigint('size', { mode: 'number' }).notNull(),
    /** The SHA-256 of the content, in hex: what tells whether two contents are the same without reading them */
    sha256: text('sha256').notNull(),
    /** Who wrote it. The database refuses to delete a user who wrote a version */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * The API key it was written through, when an agent wrote it for the person. Null when the person wrote it
     * themselves. A deleted key keeps its row (see apiKeys), so this still names it.
     */
    keyId: uuid('key_id').references(() => apiKeys.id),
    /** Kept to the millisecond, for the same reason as files.deletedAt */
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    // Exists for the foreign key from files, which has to point at something unique
    unique('file_versions_file_id_id_unique').on(table.fileId, table.id),
    // "The versions of this file, the latest first"
    index('file_versions_history_idx').on(table.fileId, table.createdAt, table.id)
  ]
);
