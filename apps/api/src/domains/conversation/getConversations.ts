import { getConversations as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { implement } from '../../http/operation.ts';
import { readConversations } from './conversation.ts';

export function getConversations({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) =>
    readConversations(db, { ...input, userId: user.id, all: false })
  );
}
