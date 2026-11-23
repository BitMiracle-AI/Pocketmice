import { deleteMessage as definition } from '@pocketmice/contract/domains/conversation';
import { roleCovers } from '@pocketmice/contract/spaceRole';
import type { Db } from '@pocketmice/db';
import { messages } from '@pocketmice/db/schema/conversation';
import { and, eq, isNull } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';

export function deleteMessage({ db }: { db: Db }) {
  return implement(definition, async ({ input, user, membership }) => {
    const theMessage = and(eq(messages.conversationId, input.conversationId), eq(messages.number, input.number));

    const [found] = await db.select({ userId: messages.userId }).from(messages).where(theMessage);
    if (!found) {
      throw new ApiError('NOT_FOUND', `Conversation ${input.conversationId} has no message ${input.number}.`);
    }
    // The one thing about who may call that is decided here and not before the implementation runs: whose message
    // it is is not known until it is read (see the definition)
    if (found.userId !== user.id && !roleCovers(membership.role, 'owner')) {
      throw new ApiError('FORBIDDEN', 'A message is deleted by whoever sent it, or by the owner of the space.');
    }

    // One that is deleted already keeps the time it was deleted at
    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(and(theMessage, isNull(messages.deletedAt)));

    return {};
  });
}
