import { getConversation as definition } from '@pocketmice/contract/domains/conversation';
import type { Db } from '@pocketmice/db';
import { implement } from '../../http/operation.ts';
import { readConversation, readConversationMembers } from './conversation.ts';

export function getConversation({ db }: { db: Db }) {
  return implement(definition, async ({ input, user }) => ({
    conversation: await readConversation(db, input.spaceId, input.conversationId, user.id),
    members: await readConversationMembers(db, input.conversationId)
  }));
}
