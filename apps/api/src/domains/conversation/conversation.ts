import type { DbReader } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { conversationMembers, conversations, messages } from '@pocketmice/db/schema/conversation';
import { profiles } from '@pocketmice/db/schema/profile';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { readTimeCursor, writeTimeCursor } from '../file/cursor.ts';
import { type Message, type MessageRow, messageColumns, toMessages } from './message.ts';

/** A conversation as an operation answers with it: how it is, and how far this caller has read */
export interface Conversation {
  id: string;
  title: string;
  lastMessageNumber: number;
  lastMessageAt: string | null;
  lastMessage: Message | null;
  /** Null when the caller is not a member of it */
  lastReadNumber: number | null;
  createdAt: string;
}

/**
 * What the conversations of a space are listed by: when the latest message was sent, or for one without a message,
 * when it was started. The index of the conversations table is on this expression, written the same way.
 */
const latestAt = sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`.mapWith(
  conversations.createdAt
);

/**
 * What is read of a conversation, for this caller: with it comes their own row as a member, which says how far they
 * have read. Someone who is not a member has no row, and reads the conversation all the same when they are the
 * owner of the space.
 * With it also comes its latest message, the one that has the number the conversation has reached, with who sent
 * it. A conversation nothing was said in has none.
 */
function selectConversations(db: DbReader, userId: string) {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      lastMessageNumber: conversations.lastMessageNumber,
      lastMessageAt: conversations.lastMessageAt,
      lastReadNumber: conversationMembers.lastReadNumber,
      createdAt: conversations.createdAt,
      latestAt,
      message: messageColumns
    })
    .from(conversations)
    .leftJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, conversations.id), eq(conversationMembers.userId, userId))
    )
    .leftJoin(
      messages,
      and(eq(messages.conversationId, conversations.id), eq(messages.number, conversations.lastMessageNumber))
    )
    .leftJoin(profiles, eq(profiles.id, messages.userId))
    .leftJoin(apiKeys, eq(apiKeys.id, messages.apiKeyId));
}

type ConversationRow = Awaited<ReturnType<typeof selectConversations>>[number];

/** Rows of one space as an operation answers with them, each with its latest message as a message is told */
async function toConversations(db: DbReader, spaceId: string, rows: ConversationRow[]): Promise<Conversation[]> {
  const latest = rows.map((row) => latestMessage(row.message));
  const told = await toMessages(
    db,
    spaceId,
    latest.filter((message) => message !== null)
  );
  // The messages come back in the order they went in: one for each conversation that has one
  let next = 0;

  return rows.map((row, index) => ({
    id: row.id,
    title: row.title,
    lastMessageNumber: row.lastMessageNumber,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessage: latest[index] === null ? null : (told[next++] ?? null),
    lastReadNumber: row.lastReadNumber,
    createdAt: row.createdAt.toISOString()
  }));
}

/**
 * The latest message of a conversation, from what was read with it. The three tables it is read from are joined
 * to a conversation that may have no message, so every column of it may be missing; with a message, the ones a
 * message always has are there.
 */
function latestMessage(read: ConversationRow['message']): MessageRow | null {
  const { number, userId, userName, text, mentionedUserIds, fileIds, createdAt } = read;
  if (
    number === null ||
    userId === null ||
    userName === null ||
    text === null ||
    mentionedUserIds === null ||
    fileIds === null ||
    createdAt === null
  ) {
    return null;
  }
  return { ...read, number, userId, userName, text, mentionedUserIds, fileIds, createdAt };
}

/**
 * One conversation of a space, as this caller sees it. That it is there was settled before an implementation ran;
 * it is gone only when someone deleted it in the moment since, which is reported as the server failing.
 */
export async function readConversation(
  db: DbReader,
  spaceId: string,
  conversationId: string,
  userId: string
): Promise<Conversation> {
  const [row] = await selectConversations(db, userId).where(
    and(eq(conversations.id, conversationId), eq(conversations.spaceId, spaceId))
  );
  const [conversation] = row ? await toConversations(db, spaceId, [row]) : [];
  if (!conversation) throw new Error(`Conversation ${conversationId} was let in and is not there to be read.`);
  return conversation;
}

/**
 * A page of the conversations of a space, as this caller sees them, the one with the latest message first: every
 * one of them when all is set, and else the ones the caller is a member of.
 */
export async function readConversations(
  db: DbReader,
  asked: { spaceId: string; userId: string; all: boolean; limit: number; cursor?: string | undefined }
): Promise<{ conversations: Conversation[]; nextCursor: string | null }> {
  const after = readTimeCursor(asked.cursor);

  // Conversations of the same millisecond go by id, so the order is the same every time.
  // One row more than the page is read, to tell whether there is a next page
  const rows = await selectConversations(db, asked.userId)
    .where(
      and(
        eq(conversations.spaceId, asked.spaceId),
        asked.all ? undefined : isNotNull(conversationMembers.userId),
        after === null
          ? undefined
          : sql`(${latestAt}, ${conversations.id}) < (${after.time}::timestamptz, ${after.id}::uuid)`
      )
    )
    .orderBy(desc(latestAt), desc(conversations.id))
    .limit(asked.limit + 1);
  const page = rows.slice(0, asked.limit);
  const last = page.at(-1);

  return {
    conversations: await toConversations(db, asked.spaceId, page),
    nextCursor: rows.length > asked.limit && last ? writeTimeCursor(last.latestAt, last.id) : null
  };
}

/** The members of a conversation in the order they came into it, each by the name they go by */
export async function readConversationMembers(
  db: DbReader,
  conversationId: string
): Promise<{ userId: string; name: string }[]> {
  return (
    db
      .select({ userId: conversationMembers.userId, name: profiles.name })
      .from(conversationMembers)
      // A member of a conversation is a member of the space, who signed in to become one: they have a profile
      .innerJoin(profiles, eq(profiles.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, conversationId))
      // Members who came in at the same moment go by id, so the order is the same every time
      .orderBy(conversationMembers.createdAt, conversationMembers.userId)
  );
}
