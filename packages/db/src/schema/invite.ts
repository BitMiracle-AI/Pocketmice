import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { spaces } from './space.ts';

/** The roles an invite can give. owner is not among them: an invite never makes an owner */
export const INVITE_ROLES = ['viewer', 'editor'] as const;

/**
 * The invites to spaces. A row is an invite that was made and not deleted; it works until expiresAt. Whoever is
 * signed in and knows its id can join the space, any number of people.
 * A row past its time is not removed: it lets nobody in, and nothing reads it.
 */
export const spaceInvites = pgTable(
  'space_invites',
  {
    /**
     * Also what the invite's link carries, and all it takes to join: the id is a secret. It is random (122 bits
     * from the database's cryptographic source), so it cannot be guessed.
     */
    id: uuid('id').defaultRandom().primaryKey(),
    /** An invite goes with its space */
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    /** The role it gives to whoever joins with it */
    role: text('role', { enum: INVITE_ROLES }).notNull(),
    /** Who made it. An invite goes with the user who made it: that takes access away, and never gives any */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  // "The invites to this space" looks up by space
  (table) => [index('space_invites_space_id_idx').on(table.spaceId)]
);
