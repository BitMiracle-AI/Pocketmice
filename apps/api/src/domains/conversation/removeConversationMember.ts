import { removeConversationMember as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversationMembers } from '@pocketmice/db/schema/conversation';
import { and, eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function removeConversationMember({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const removed = await db
      .delete(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, input.userId))
      )
      .returning({ userId: conversationMembers.userId });
    if (removed.length === 0) {
      throw new ApiError('NOT_FOUND', `Conversation ${input.conversationId} has no member ${input.userId}.`);
    }

    return {};
  });
}
