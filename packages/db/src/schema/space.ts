import { sql } from 'drizzle-orm';
import { index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';

/**
 * A space: the container everything in the drive belongs to. An operation of a space finds it by its id, and who
 * may get in is decided by spaceMembers alone.
 */
export const spaces = pgTable('spaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** The name. Two spaces may have the same one */
  name: text('name').notNull(),
  /**
   * Who made the space. It never changes: who owns the space now is read from the role in the member's row, not
   * from here.
   * What happens when the user is deleted is not written, so the database refuses to delete a user who made a
   * space: a space and what is in it are not carried away silently.
   */
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
});

/**
 * The role of a member in a space. There is one: owner. Whoever makes a space is its owner, and a space has
 * exactly one.
 */
export const SPACE_ROLES = ['owner'] as const;

export type SpaceRole = (typeof SPACE_ROLES)[number];

/**
 * Who is in which space. A row means "is a member now". Someone has at most one row in a space, which the primary
 * key guarantees; they may have rows in any number of spaces, or in none.
 */
export const spaceMembers = pgTable(
  'space_members',
  {
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id),
    /** As with spaces.userId, the database refuses to delete a user who is a member of a space */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: SPACE_ROLES }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.userId] }),
    // "Which spaces am I in" looks up by person. Looking up by space is served by the primary key, where the space
    // comes first
    index('space_members_user_id_idx').on(table.userId),
    // At most one owner in a space, guaranteed by the database: no mistake in code that writes roles can make a
    // second one
    uniqueIndex('space_members_one_owner_idx').on(table.spaceId).where(sql`${table.role} = 'owner'`)
  ]
);
