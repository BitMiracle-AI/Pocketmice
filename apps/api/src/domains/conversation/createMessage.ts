import { createMessage as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversationMembers, conversations, messages } from '@pocketmice/db/schema/conversation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findFiles, isInTrash } from '../file/findFile.ts';
import { selectMessages, toMessages } from './message.ts';

export function createMessage({ db }: { db: Db }) {
  return implement(definition, async ({ input, user, apiKeyId }) => {
    // Each named once, however often the caller named it
    const mentionedUserIds = [...new Set(input.mentionedUserIds)];
    const fileIds = [...new Set(input.fileIds)];

    // Whoever is mentioned is in the conversation: a mention of someone who cannot read it would reach nobody
    if (mentionedUserIds.length > 0) {
      const members = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, input.conversationId),
            inArray(conversationMembers.userId, mentionedUserIds)
          )
        );
      const inIt = new Set(members.map(({ userId }) => userId));
      const stranger = mentionedUserIds.find((userId) => !inIt.has(userId));
      if (stranger !== undefined) {
        throw new ApiError(
          'NOT_FOUND',
          `Conversation ${input.conversationId} has no member ${stranger}: a message mentions members of its conversation.`
        );
      }
    }

    // What is pointed at is in the space, and not in the trash, when the message is sent. What becomes of it
    // later is told when the message is read (see toMessages)
    if (fileIds.length > 0) {
      const found = await findFiles(db, input.spaceId, fileIds);
      const missing = fileIds.find((fileId) => {
        const file = found.get(fileId);
        return !file || isInTrash(file);
      });
      if (missing !== undefined) {
        throw new ApiError('NOT_FOUND', `There is no file ${missing} in space ${input.spaceId}.`);
      }
    }

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
        mentionedUserIds,
        fileIds,
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
    const [message] = await toMessages(db, input.spaceId, [sent]);
    if (!message) throw new Error(`Message ${number} of conversation ${input.conversationId} could not be told.`);
    return { message };
  });
}
