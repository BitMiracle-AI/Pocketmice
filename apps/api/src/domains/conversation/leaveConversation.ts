import { leaveConversation as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversationMembers } from '@pocketmice/db/schema/conversation';
import { and, eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { tellSpace } from '../event/spaceEvents.ts';

export function leaveConversation({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    await db
      .delete(conversationMembers)
      .where(
        and(eq(conversationMembers.conversationId, input.conversationId), eq(conversationMembers.userId, user.id))
      );
    // Also whoever left: their other pages and their agents, for which it is gone
    await tellSpace(db, { spaceId: input.spaceId, conversationId: input.conversationId, alsoUserIds: [user.id] });

    return {};
  });
}
