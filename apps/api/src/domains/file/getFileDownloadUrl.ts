import { DOWNLOAD_URL_SECONDS, getFileDownloadUrl as definition } from '@pocketmice/contract/domains/file';
import type { Db } from '@pocketmice/db';
import { fileVersions } from '@pocketmice/db/schema/file';
import { and, eq } from 'drizzle-orm';
import type { FileStorage } from '../../external/storage/fileStorage.ts';
import { ApiError, implement } from '../../http/operation.ts';
import { selectVersions, toVersion } from './fileVersion.ts';
import { liveFile } from './findFile.ts';

// Who may read the file is decided here, when the address is made, and not when it is fetched: the storage lets in
// whoever holds an address, until its time is up. So an address is short-lived, and someone taken out of the space
// reads on with one they hold for no longer than that.

export function getFileDownloadUrl({ db, storage }: { db: Db; storage: FileStorage }) {
  return implement(definition, async ({ input }) => {
    const found = await liveFile(db, input.spaceId, input.fileId);
    if (!found.version) throw new ApiError('NOT_FOUND', `File ${input.fileId} is a folder: it has no content.`);

    let version = found.version;
    if (input.versionId !== null && input.versionId !== version.id) {
      const [row] = await selectVersions(db).where(
        and(eq(fileVersions.fileId, input.fileId), eq(fileVersions.id, input.versionId))
      );
      if (!row) throw new ApiError('NOT_FOUND', `File ${input.fileId} has no version ${input.versionId}.`);
      version = toVersion(row);
    }

    // An object is named after the version whose content it is. It is saved under the name the file has now,
    // whichever version of it is asked for
    const url = await storage.downloadUrl(version.id, { saveAs: found.row.name, seconds: DOWNLOAD_URL_SECONDS });
    return { url, version };
  });
}
