import { createConversation as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversationMembers, conversations } from '@pocketmice/db/schema/conversation';
import { implement } from '../../http/operation.ts';
import { tellSpace } from '../event/spaceEvents.ts';

export function createConversation({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // The conversation and its first member's row are made in one transaction: a conversation nobody is in, which
    // only the owner of the space would ever find, is not left behind by a failure half way
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(conversations)
        .values({ spaceId: input.spaceId, title: input.title, userId: user.id })
        .returning({ id: conversations.id, title: conversations.title, createdAt: conversations.createdAt });
      if (!row) throw new Error('The conversation was not created.');
      await tx.insert(conversationMembers).values({ conversationId: row.id, userId: user.id, spaceId: input.spaceId });
      // For the other pages of the caller and their agents, and for the owner of the space
      await tellSpace(tx, { spaceId: input.spaceId, conversationId: row.id });
      return row;
    });

    return {
      conversation: {
        id: created.id,
        title: created.title,
        lastMessageNumber: 0,
        lastMessageAt: null,
        lastMessage: null,
        lastReadNumber: 0,
        createdAt: created.createdAt.toISOString()
      }
    };
  });
}
