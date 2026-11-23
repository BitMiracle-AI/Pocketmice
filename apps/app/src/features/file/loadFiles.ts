import { getFile, getFileByPath } from '@pocketmice/contract/domains/file';
import { id } from '@pocketmice/contract/id';
import { notFound } from '@tanstack/react-router';
import { ApiFailure, queryClient, readQuery } from '@/lib/api';
import { foldersAbove } from './fileOrder';
import { folderQuery } from './files';
import { versionsQuery } from './versions';

/**
 * What the page of the files needs before it is shown. fileId is what the address says is picked, a file or a
 * folder, or null when it says nothing: then it is what is directly in the space.
 * With something picked it is the file itself, then every folder on the way down to it, each with what is in it
 * (they are the columns of the page), and its versions when it is a file. The api names a file by its id and its
 * path: the folder right above is in the file itself, and the ones further up are asked for by their paths.
 * An address can be written by anyone: what is no id, and an id the space has nothing for, is "not found", and the
 * route says so in place of the page.
 */
export async function loadFiles(spaceId: string, fileId: string | null): Promise<void> {
  if (fileId === null) {
    await queryClient.ensureQueryData(folderQuery(spaceId, null));
    return;
  }
  if (!id.safeParse(fileId).success) throw notFound();
  try {
    const { file } = await queryClient.ensureQueryData(readQuery(getFile, { spaceId, fileId }));
    const further = await Promise.all(
      foldersAbove(file.path)
        .slice(0, -1)
        .map(({ path }) => queryClient.ensureQueryData(readQuery(getFileByPath, { spaceId, path })))
    );
    const open = [
      null,
      ...further.map((each) => each.file.id),
      ...(file.parentId === null ? [] : [file.parentId]),
      ...(file.kind === 'folder' ? [file.id] : [])
    ];
    await Promise.all([
      ...open.map((folderId) => queryClient.ensureQueryData(folderQuery(spaceId, folderId))),
      ...(file.kind === 'folder' ? [] : [queryClient.ensureInfiniteQueryData(versionsQuery(spaceId, fileId))])
    ]);
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'NOT_FOUND') throw notFound();
    throw error;
  }
}
