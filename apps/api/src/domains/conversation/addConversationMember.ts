import { addConversationMember as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversationMembers, conversations } from '@pocketmice/db/schema/conversation';
import { sql } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import { findMembership } from '../space/findMembership.ts';

export function addConversationMember({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    // Asked first, to answer with a code a caller can act on. That a member of a conversation is a member of its
    // space is not left to this line: the database refuses a row that says otherwise (see conversationMembers)
    if (!(await findMembership(db, input.spaceId, input.userId))) {
      throw new ApiError('NOT_FOUND', `Space ${input.spaceId} has no member ${input.userId}.`);
    }

    // The new member starts at the number the conversation has reached, read in the statement that writes the row:
    // a message sent at the same moment is either before the row and read, or after it and unread, never neither.
    // Someone who is in the conversation already keeps their row as it is
    await db.execute(sql`
      insert into ${conversationMembers} (conversation_id, user_id, space_id, last_read_number)
      select ${conversations.id}, ${input.userId}, ${conversations.spaceId}, ${conversations.lastMessageNumber}
      from ${conversations}
      where ${conversations.id} = ${input.conversationId} and ${conversations.spaceId} = ${input.spaceId}
      on conflict do nothing
    `);

    return {};
  });
}
