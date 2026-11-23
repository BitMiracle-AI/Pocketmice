import { updateConversation as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversations } from '@pocketmice/db/schema/conversation';
import { and, eq } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { tellSpace } from '../event/spaceEvents.ts';
import { readConversation } from './conversation.ts';

export function updateConversation({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    await db
      .update(conversations)
      .set({ title: input.title })
      .where(and(eq(conversations.id, input.conversationId), eq(conversations.spaceId, input.spaceId)));
    await tellSpace(db, { spaceId: input.spaceId, conversationId: input.conversationId });

    return { conversation: await readConversation(db, input.spaceId, input.conversationId, user.id) };
  });
}
