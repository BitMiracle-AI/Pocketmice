import type { Db } from '@pocketmice/db';
import { conversationMembers, conversations } from '@pocketmice/db/schema/conversation';
import { and, eq, sql } from 'drizzle-orm';
import type { ConversationAccess } from '../../http/operation.ts';

/**
 * What this person is to this conversation of this space. Null when that space has no such conversation.
 * For every call of an operation of a conversation, the layer of the operations asks this (see http/operation.ts),
 * and decides there who is let in: "is the caller a member of the conversation" is answered here and nowhere else.
 */
export async function findConversationAccess(
  db: Db,
  spaceId: string,
  conversationId: string,
  userId: string
): Promise<ConversationAccess | null> {
  const [row] = await db
    .select({ member: sql<boolean>`${conversationMembers.userId} is not null` })
    .from(conversations)
    .leftJoin(
      conversationMembers,
      and(eq(conversationMembers.conversationId, conversations.id), eq(conversationMembers.userId, userId))
    )
    .where(and(eq(conversations.id, conversationId), eq(conversations.spaceId, spaceId)));

  return row ?? null;
}
