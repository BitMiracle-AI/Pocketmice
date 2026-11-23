import { getFile } from '@pocketmice/contract/domains/file';
import { id } from '@pocketmice/contract/id';
import { notFound } from '@tanstack/react-router';
import { ApiFailure, queryClient, readQuery } from '@/lib/api';
import { folderQuery } from './files';
import { versionsQuery } from './versions';

/**
 * What the page of a file or a folder needs before it is shown: the file itself, and then what is in it when it is
 * a folder, or its versions when it is a file. fileId is the one in the address, which anyone can write: what is
 * no id, and an id the space has nothing for, is "not found", and the route says so in place of the page.
 */
export async function loadFile(spaceId: string, fileId: string): Promise<void> {
  if (!id.safeParse(fileId).success) throw notFound();
  try {
    const { file } = await queryClient.ensureQueryData(readQuery(getFile, { spaceId, fileId }));
    await (file.kind === 'folder'
      ? queryClient.ensureQueryData(folderQuery(spaceId, fileId))
      : queryClient.ensureInfiniteQueryData(versionsQuery(spaceId, fileId)));
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'NOT_FOUND') throw notFound();
    throw error;
  }
}
