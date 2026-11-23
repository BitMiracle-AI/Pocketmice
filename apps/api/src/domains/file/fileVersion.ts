import type { DbReader } from '@pocketmice/db';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { fileVersions } from '@pocketmice/db/schema/file';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq, inArray } from 'drizzle-orm';

/** A version as an operation answers with it: the content, and who wrote it through which key */
export interface FileVersion {
  id: string;
  size: number;
  sha256: string;
  createdAt: string;
  user: { id: string; name: string };
  apiKey: { id: string; name: string } | null;
}

/**
 * What is read of a version, with the name of who wrote it and of the key it was written through.
 * The key is joined whether or not it was deleted since: a deleted key keeps its row, so that this still names it.
 */
export function selectVersions(db: DbReader) {
  return (
    db
      .select({
        id: fileVersions.id,
        size: fileVersions.size,
        sha256: fileVersions.sha256,
        createdAt: fileVersions.createdAt,
        userId: fileVersions.userId,
        userName: profiles.name,
        apiKeyId: fileVersions.apiKeyId,
        apiKeyName: apiKeys.name
      })
      .from(fileVersions)
      // Whoever wrote a version was signed in, or had a key: either way they have a profile (see ensureProfile)
      .innerJoin(profiles, eq(profiles.id, fileVersions.userId))
      .leftJoin(apiKeys, eq(apiKeys.id, fileVersions.apiKeyId))
  );
}

type VersionRow = Awaited<ReturnType<typeof selectVersions>>[number];

/** A row read by selectVersions, as an operation answers with it */
export function toVersion(row: VersionRow): FileVersion {
  return {
    id: row.id,
    size: row.size,
    sha256: row.sha256,
    createdAt: row.createdAt.toISOString(),
    user: { id: row.userId, name: row.userName },
    apiKey: row.apiKeyId !== null && row.apiKeyName !== null ? { id: row.apiKeyId, name: row.apiKeyName } : null
  };
}

/** The versions with these ids, by id */
export async function findVersions(db: DbReader, ids: string[]): Promise<Map<string, FileVersion>> {
  if (ids.length === 0) return new Map();
  const rows = await selectVersions(db).where(inArray(fileVersions.id, ids));
  return new Map(rows.map((row) => [row.id, toVersion(row)]));
}
