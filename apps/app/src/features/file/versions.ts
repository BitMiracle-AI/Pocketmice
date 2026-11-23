import { getFileVersions, restoreFileVersion } from '@pocketmice/contract/domains/file';
import type { OutputOf } from '@pocketmice/contract/operation';
import { toast } from '@/components/ui/toast';
import { call, failureText, readPages, spaceChanged } from '@/lib/api';
import { formatMoment } from '@/lib/format';
import type { DriveFile } from './files';
import { fileText } from './text';

// The versions of a file. Every write to a file is a new version, and the ones before it stay: whatever a person
// or an agent wrote over is still there, and can be made the content of the file again. Doing so adds a version
// with that content on top, so the history only ever grows, and nothing is asked before it is done.

/** One content a file has had: how large, who wrote it and when */
export type FileVersion = OutputOf<typeof getFileVersions>['versions'][number];

/** The versions of a file, the latest first, a page at a time: the first is its content now */
export function versionsQuery(spaceId: string, fileId: string) {
  return readPages(getFileVersions, { spaceId, fileId });
}

/**
 * Makes an old version of a file its content again, and says so. file is the file as the page shows it: the
 * version it has there is the one the person saw, and the one being replaced. When somebody wrote to the file in
 * the meantime nothing is replaced: the page says so, and shows the versions as they are now.
 */
export async function restoreVersion(spaceId: string, file: DriveFile, version: FileVersion): Promise<void> {
  if (!file.version) return;
  const result = await call(restoreFileVersion, {
    spaceId,
    fileId: file.id,
    versionId: version.id,
    baseVersionId: file.version.id
  });
  spaceChanged(spaceId);
  toast.add(
    result.ok
      ? { title: fileText.versionRestored(formatMoment(version.createdAt)) }
      : {
          type: 'error',
          title: failureText(result.code, {
            CONFLICT: fileText.versionConflict,
            NOT_FOUND: fileText.versionGone,
            SPACE_STORAGE_LIMIT_EXCEEDED: fileText.versionSpaceFull,
            MEMBER_STORAGE_LIMIT_EXCEEDED: fileText.versionMemberFull
          })
        }
  );
}
