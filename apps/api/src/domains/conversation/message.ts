import { pathOfNames } from '@pocketmice/contract/domains/file';
import type { DbReader } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { messages } from '@pocketmice/db/schema/conversation';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq } from 'drizzle-orm';
import { type FoundFile, findFiles, isInTrash } from '../file/findFile.ts';

/** A message as an operation answers with it: what was said, who said it and through which key */
export interface Message {
  number: number;
  user: { id: string; name: string };
  apiKey: { id: string; name: string } | null;
  text: string;
  mentionedUserIds: string[];
  files: { id: string; file: { name: string; kind: 'file' | 'folder'; path: string } | null }[];
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
  mentionedUserIds: string[];
  fileIds: string[];
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
  mentionedUserIds: messages.mentionedUserIds,
  fileIds: messages.fileIds,
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
 * Rows of one space as an operation answers with them. Every message an operation answers with passes through
 * here, for two things that are decided here and nowhere else:
 * - What a deleted message said, whom it mentioned and what it pointed at are in its row, and go no further.
 * - What a message points at is looked up as it is now, in the space of the conversation: all the files of all the
 *   rows in one go. An id that is of another space, or of no file, finds nothing, and so does a file in the trash.
 */
export async function toMessages(db: DbReader, spaceId: string, rows: MessageRow[]): Promise<Message[]> {
  const pointedAt = new Set(rows.flatMap((row) => (row.deletedAt === null ? row.fileIds : [])));
  const found = await findFiles(db, spaceId, [...pointedAt]);

  return rows.map((row) => {
    const deleted = row.deletedAt !== null;
    return {
      number: row.number,
      user: { id: row.userId, name: row.userName },
      apiKey: row.apiKeyId !== null && row.apiKeyName !== null ? { id: row.apiKeyId, name: row.apiKeyName } : null,
      text: deleted ? '' : row.text,
      mentionedUserIds: deleted ? [] : row.mentionedUserIds,
      files: deleted ? [] : row.fileIds.map((id) => ({ id, file: asItIsNow(found.get(id)) })),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString()
    };
  });
}

/** What a message tells of a file it points at. Null for one that is not there: never was, or is in the trash */
function asItIsNow(file: FoundFile | undefined) {
  if (!file || isInTrash(file)) return null;
  return { name: file.row.name, kind: file.row.kind, path: pathOfNames(file.names) };
}
