import { deleteConversation as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversations } from '@pocketmice/db/schema/conversation';
import { and, eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function deleteConversation({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    // Who is in it goes with its row (see the conversationMembers table)
    await db
      .delete(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.spaceId, input.spaceId)));

    return {};
  });
}
