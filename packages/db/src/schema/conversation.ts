import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { spaceMembers, spaces } from './space.ts';

/**
 * The conversations of the spaces: each is about one matter, has a title, and has members of its own
 * (conversationMembers). The rules are in the contract (domains/conversation.ts).
 * A row is there from when someone starts the conversation until the owner of the space deletes it, or the space
 * is deleted. Who is in it does not decide that: a conversation every member has left keeps its row.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    /** The space it is in. That never changes. A conversation goes with its space */
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Who started it. As with a space, the database refuses to delete a user who started one */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * The number of its latest message, 0 when it has none. The messages of a conversation are numbered from 1.
     * This is where the numbers come from: sending a message adds one to it, in the transaction that writes the
     * message, and holds this row while it does. So no number is given twice or left out, and a message with a
     * larger number was written later.
     */
    lastMessageNumber: integer('last_message_number').notNull().default(0),
    /**
     * When its latest message was sent. Null when it has none.
     * A copy of that message's time, kept here so that the conversations of a space can be listed by it without
     * reading a message of each.
     * Kept to the millisecond, like createdAt: the list goes by one or the other, and a cursor writes the time to
     * the millisecond (see cursor.ts in the api).
     */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date())
  },
  (table) => [
    // Exists for the foreign key from conversationMembers, which has to point at something unique
    unique('conversations_space_id_id_unique').on(table.spaceId, table.id),
    // "The conversations of this space, the one with the latest message first", where one without a message counts
    // by when it was started. Whoever lists them writes the same expression, or this index is not used
    index('conversations_space_latest_idx').on(
      table.spaceId,
      sql`coalesce(${table.lastMessageAt}, ${table.createdAt})`,
      table.id
    )
  ]
);

/**
 * Who is in which conversation. A row means "is a member now"; someone has at most one row in a conversation.
 * Two things the database guarantees here, whatever the code that writes members does:
 * - A member of a conversation is a member of its space. The row carries the space, and points at the row that
 *   makes the person a member of it.
 * - Whoever stops being a member of the space is out of its conversations: their rows here go with that row.
 */
export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid('conversation_id').notNull(),
    userId: uuid('user_id').notNull(),
    /** The space of the conversation: a copy, here for the two foreign keys below */
    spaceId: uuid('space_id').notNull(),
    /**
     * The number of the latest message this member has read. What is unread for them is every message with a
     * larger number. Someone who is added starts at the number the conversation has reached by then: what was
     * said before is theirs to read, and does not count as unread.
     */
    lastReadNumber: integer('last_read_number').notNull().default(0),
    /** When they came into the conversation */
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    // The conversation is one of the space the row names, and the row goes when the conversation is deleted
    foreignKey({
      name: 'conversation_members_conversation_fk',
      columns: [table.spaceId, table.conversationId],
      foreignColumns: [conversations.spaceId, conversations.id]
    }).onDelete('cascade'),
    // The person is a member of that space, and the row goes when they stop being one
    foreignKey({
      name: 'conversation_members_space_member_fk',
      columns: [table.spaceId, table.userId],
      foreignColumns: [spaceMembers.spaceId, spaceMembers.userId]
    }).onDelete('cascade'),
    // "The conversations of this space that this person is in". It also serves the second foreign key: when a
    // member of a space goes, the database looks here for their rows
    index('conversation_members_user_idx').on(table.userId, table.spaceId)
  ]
);
