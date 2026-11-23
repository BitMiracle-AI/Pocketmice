import type { DbReader } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { messages } from '@pocketmice/db/schema/conversation';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq } from 'drizzle-orm';

/** A message as an operation answers with it: what was said, who said it and through which key */
export interface Message {
  number: number;
  user: { id: string; name: string };
  apiKey: { id: string; name: string } | null;
  text: string;
  deletedAt: string | null;
  createdAt: string;
}

/** What is read of a message, with the name of who sent it and of the key it was sent through */
export interface MessageRow {
  number: number;
  userId: string;
  userName: string;
  apiKeyId: string | null;
  apiKeyName: string | null;
  text: string;
  deletedAt: Date | null;
  createdAt: Date;
}

/**
 * The columns of a MessageRow. Whoever selects them joins profiles to the sender and apiKeys to the key, as
 * selectMessages does.
 */
export const messageColumns = {
  number: messages.number,
  userId: messages.userId,
  userName: profiles.name,
  apiKeyId: messages.apiKeyId,
  apiKeyName: apiKeys.name,
  text: messages.text,
  deletedAt: messages.deletedAt,
  createdAt: messages.createdAt
};

/**
 * The messages, each with who sent it. The key is joined whether or not it was deleted since: a deleted key keeps
 * its row, so that a message still says which key it was sent through.
 */
export function selectMessages(db: DbReader) {
  return (
    db
      .select(messageColumns)
      .from(messages)
      // Whoever sent a message was a member of the space, who signed in to become one: they have a profile
      .innerJoin(profiles, eq(profiles.id, messages.userId))
      .leftJoin(apiKeys, eq(apiKeys.id, messages.apiKeyId))
  );
}

/**
 * A row as an operation answers with it. Every message an operation answers with passes through here, and this is
 * where the text of a deleted one stops: it is in the row, and goes no further.
 */
export function toMessage(row: MessageRow): Message {
  return {
    number: row.number,
    user: { id: row.userId, name: row.userName },
    apiKey: row.apiKeyId !== null && row.apiKeyName !== null ? { id: row.apiKeyId, name: row.apiKeyName } : null,
    text: row.deletedAt === null ? row.text : '',
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}
