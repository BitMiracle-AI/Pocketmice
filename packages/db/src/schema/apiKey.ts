import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';

/** What a key may do: read is reads only; write is reads and writes. The contract lists the same two */
export const API_KEY_PERMISSIONS = ['read', 'write'] as const;

/**
 * The API keys people made for their agents. A request sent with a key is from the user of its row; an agent has no
 * row of its own anywhere.
 * A row is a key that works. Deleting the row is how a key stops working, and a key never changes.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** Whose key it is. A key goes with its user */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** What the person calls it, to tell their keys apart */
    name: text('name').notNull(),
    permission: text('permission', { enum: API_KEY_PERMISSIONS }).notNull(),
    /**
     * The SHA-256 of the key, in hex. The key itself is not stored, so nobody who reads the database can call the
     * api with it. A request is matched to its row by this column, which is why it is unique.
     */
    keyHash: text('key_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  // "My keys" looks up by person
  (table) => [index('api_keys_user_id_idx').on(table.userId)]
);
