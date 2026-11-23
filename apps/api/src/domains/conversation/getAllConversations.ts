import { getAllConversations as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { implement } from '../../http/operation.ts';
import { readConversations } from './conversation.ts';

export function getAllConversations({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) =>
    readConversations(db, { ...input, userId: user.id, all: true })
  );
}
