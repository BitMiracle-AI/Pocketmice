import { randomUUID } from 'node:crypto';
import { restoreFileVersion as definition, pathOfNames } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { fileVersions } from '@pocketmice/db/schema/file';
import { and, eq } from 'drizzle-orm';
import { ApiError, implement } from '../../http/operation.ts';
import type { FileStorage } from '../../storage/fileStorage.ts';
import { liveFile, toFile } from './findFile.ts';
import { addVersionRow, assertCanReplace, removeContent } from './writeContent.ts';

interface Deps {
  db: Db;
  storage: FileStorage;
  reportError: (error: unknown, where: string) => void;
}

export function restoreFileVersion({ db, storage, reportError }: Deps) {
  return implement(definition, async ({ input, user, apiKeyId }) => {
    await assertCanReplace(db, input);
    const [old] = await db
      .select({ id: fileVersions.id, size: fileVersions.size, sha256: fileVersions.sha256 })
      .from(fileVersions)
      .where(and(eq(fileVersions.fileId, input.fileId), eq(fileVersions.id, input.versionId)));
    if (!old) throw new ApiError('NOT_FOUND', `File ${input.fileId} has no version ${input.versionId}.`);

    // The version asked for is the content already (assertCanReplace made sure baseVersionId is the current one)
    if (old.id !== input.baseVersionId) {
      // A version of its own, with bytes of its own: the old version is not pointed at twice, so each version can
      // be removed without asking what else uses its bytes
      const stored = { versionId: randomUUID(), size: old.size, sha256: old.sha256 };
      await storage.copy(old.id, stored.versionId);
      try {
        await addVersionRow(db, input, stored, { userId: user.id, apiKeyId });
      } catch (error) {
        await removeContent(storage, [stored.versionId], reportError);
        throw error;
      }
    }

    const found = await liveFile(db, input.spaceId, input.fileId);
    return { file: toFile(found.row, pathOfNames(found.names), found.version) };
  });
}
