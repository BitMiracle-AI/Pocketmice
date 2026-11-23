import { createMessage as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversations, messages } from '@pocketmice/db/schema/conversation';
import { and, eq, sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { selectMessages, toMessage } from './message.ts';

export function createMessage({ db }: { db: Db }) {
  return implement(definition, async ({ input, user, apiKeyId }) => {
    const number = await db.transaction(async (tx) => {
      // The number is taken first, by moving the conversation on by one. That holds the row of the conversation
      // until this transaction ends: two messages sent together take their numbers one after the other, and the
      // one with the larger number is also the one that is written later. So whoever has read up to a number
      // misses nothing by asking for what comes after it.
      // The time is the clock's at this statement and not the transaction's: a transaction that began earlier and
      // waited here would otherwise date its message before the one it comes after
      const [reached] = await tx
        .update(conversations)
        .set({
          lastMessageNumber: sql`${conversations.lastMessageNumber} + 1`,
          lastMessageAt: sql`clock_timestamp()`
        })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.spaceId, input.spaceId)))
        .returning({ number: conversations.lastMessageNumber, at: conversations.lastMessageAt });
      // That the conversation is there was settled before this ran; it is gone only when someone deleted it in
      // the moment since
      if (!reached || reached.at === null) {
        throw new Error(`Conversation ${input.conversationId} was let in and is not there to be written to.`);
      }

      await tx.insert(messages).values({
        conversationId: input.conversationId,
        number: reached.number,
        userId: user.id,
        apiKeyId,
        text: input.text,
        // The time the conversation was given: the two say the same
        createdAt: reached.at
      });
      return reached.number;
    });

    const [sent] = await selectMessages(db).where(
      and(eq(messages.conversationId, input.conversationId), eq(messages.number, number))
    );
    if (!sent)
      throw new Error(`Message ${number} of conversation ${input.conversationId} was written and is not there.`);
    return { message: toMessage(sent) };
  });
}
