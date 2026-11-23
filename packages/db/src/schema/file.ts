import { sql } from 'drizzle-orm';
import { foreignKey, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { spaces } from './space.ts';

/** What a row of files is: a file, or a folder that holds others. The contract lists the same two */
export const FILE_KINDS = ['file', 'folder'] as const;

/**
 * What is in the spaces: a tree in each. A file and a folder are both a row here, told apart by kind.
 * Where a row sits is its parent, and its path is the names from the top of the space down to it. The path is
 * stored nowhere: renaming or moving a folder changes one row, and everything in it follows.
 * The id of a row never changes, whatever its name and its place become.
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
    /** Who made it. As with a space, the database refuses to delete a user who made one */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * When it was put in the trash. Null for one that was not.
     * Only the row that was trashed is marked. What is in a trashed folder is in the trash with it, and its rows
     * say nothing of that: whether something is in the trash is read from the folders it is in, up to the top.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
    index('files_trash_idx').on(table.spaceId, table.deletedAt).where(sql`${table.deletedAt} is not null`)
  ]
);
