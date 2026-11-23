import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';

/**
 * A space: the container everything in the drive belongs to. An operation of a space finds it by its id, and who
 * may get in is decided by spaceMembers alone.
 */
export const spaces = pgTable(
  'spaces',
  {
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
    /**
     * The most the space may hold, in bytes. Null when its owner has set no limit.
     * How much it holds is written nowhere: it is the sizes of the versions of its files, added up when asked for
     * (see fileVersions, and storageLimit.ts in the api).
     */
    storageLimit: bigint('storage_limit', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  (table) => [check('spaces_storage_limit_check', sql`${table.storageLimit} >= 0`)]
);

/**
 * The roles a member of a space can have. Whoever makes a space is its owner, and a space has exactly one.
 * What each role may do is not decided here: see spaceRole.ts in the contract, which lists the same roles. The api
 * hands roles from one list to the other, so a role that is in one and not in the other fails its type check.
 */
export const SPACE_ROLES = ['viewer', 'editor', 'owner'] as const;

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
    /**
     * The most this member may hold in the space, in bytes: the versions they wrote, themselves or through an API
     * key of theirs. Null when the owner has set no limit for them, and then only the limit of the space holds
     * them.
     */
    storageLimit: bigint('storage_limit', { mode: 'number' }),
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
    uniqueIndex('space_members_one_owner_idx').on(table.spaceId).where(sql`${table.role} = 'owner'`),
    check('space_members_storage_limit_check', sql`${table.storageLimit} >= 0`)
  ]
);
