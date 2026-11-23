import { getMessages as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { messages } from '@pocketmice/db/schema/conversation';
import { and, eq, gt } from 'drizzle-orm';
import { implement } from '../../http/operation.ts';
import { selectMessages, toMessages } from './message.ts';

export function getMessages({ db }: { db: Db }) {
  return implement(definition, async ({ input }) => {
    const rows = await selectMessages(db)
      .where(and(eq(messages.conversationId, input.conversationId), gt(messages.number, input.afterNumber)))
      .orderBy(messages.number)
      .limit(input.limit);

    return { messages: await toMessages(db, input.spaceId, rows) };
  });
}
