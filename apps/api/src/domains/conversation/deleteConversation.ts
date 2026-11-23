import { deleteConversation as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversations } from '@pocketmice/db/schema/conversation';
import { and, eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { tellSpace } from '../event/spaceEvents.ts';

export function deleteConversation({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    // Who is in it goes with its row (see the conversationMembers table)
    await db
      .delete(conversations)
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.spaceId, input.spaceId)));
    // Who was in it went with it, so the whole space is told (see Told)
    await tellSpace(db, { spaceId: input.spaceId, conversationId: input.conversationId, wholeSpace: true });

    return {};
  });
}
