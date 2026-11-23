import { markConversationRead as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { conversationMembers, conversations } from '@pocketmice/db/schema/conversation';
import { sql } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';

export function markConversationRead({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => {
    // One statement decides the number: never below what the member has read already, never above what the
    // conversation has reached. Two pages of the same person that say different numbers at the same moment leave
    // the larger, whichever arrives last
    await db.execute(sql`
      update ${conversationMembers}
      set last_read_number = greatest(
        ${conversationMembers.lastReadNumber},
        least(${input.number}::integer, ${conversations.lastMessageNumber})
      )
      from ${conversations}
      where ${conversations.id} = ${conversationMembers.conversationId}
        and ${conversationMembers.conversationId} = ${input.conversationId}
        and ${conversationMembers.userId} = ${user.id}
    `);

    return {};
  });
}
