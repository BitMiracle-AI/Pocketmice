import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';

/**
 * One row for each person: who they are inside Pocketmice, as far as they say so themselves.
 * What is not here: the email address and how a person signs in belong to the sign-in library's tables
 * (schema/auth.ts), which are generated from its configuration; which spaces a person is in goes with the spaces.
 * The row is made after the person's first session is started and before its cookie is handed over (see
 * ensureProfile in apps/api), and is deleted with the user. So whoever is signed in has one.
 */
export const profiles = pgTable('profiles', {
  /** The user's id: a person has one row */
  id: uuid('id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /**
   * The name they go by. This is the one that counts. The sign-in library's users.name holds what was typed at
   * sign-up; it is read once, when this row is made, and by nobody after that
   */
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())
});
