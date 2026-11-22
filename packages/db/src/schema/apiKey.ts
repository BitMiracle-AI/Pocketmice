import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';

/** What a key may do: read is reads only; write is reads and writes. The contract lists the same two */
export const API_KEY_PERMISSIONS = ['read', 'write'] as const;

/**
 * The API keys people made for their agents. A request sent with a key is from the user of its row; an agent has no
 * row of its own anywhere.
 * A key works from the moment its row is made until the person deletes it. Deleting marks the row and leaves it
 * there, so that a record of what was done with the key can still name it. Nothing else about a key ever changes.
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
     * The key itself, as a request sends it. It is kept as it is so that the person can copy it again later.
     * The price: whoever can read this table can call the api with every key in it that works. The database and
     * its backups are to be guarded the way a credential is.
     * A request is matched to its row by this column, which is why it is unique.
     */
    key: text('key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    /** When the person deleted the key. Null for a key that works */
    deletedAt: timestamp('deleted_at', { withTimezone: true })
  },
  // "My keys" looks up by person
  (table) => [index('api_keys_user_id_idx').on(table.userId)]
);
