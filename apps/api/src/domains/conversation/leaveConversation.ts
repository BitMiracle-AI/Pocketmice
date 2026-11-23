import { leaveConversation as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversationMembers } from '@pocketmice/db/schema/conversation';
import { and, eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function leaveConversation({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    await db
      .delete(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, user.id))
      );

    return {};
  });
}
