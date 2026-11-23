import { getFile } from '@pocketmice/contract/domains/file';
import { id } from '@pocketmice/contract/id';
import { notFound, redirect } from '@tanstack/react-router';
import { ApiFailure, queryClient, readQuery } from '@/lib/api';
import { folderQuery } from './files';

/**
 * What the page of a folder needs before it is shown: the folder itself, and what is in it. fileId is the one in
 * the address, which anyone can write: what is no id, and an id the space has no folder for, is "not found", and
 * the route says so in place of the page.
 * The address of a file leads to the folder the file is in: a file has no page of its own yet.
 */
export async function loadFolder(spaceId: string, fileId: string): Promise<void> {
  if (!id.safeParse(fileId).success) throw notFound();
  try {
    const { file } = await queryClient.ensureQueryData(readQuery(getFile, { spaceId, fileId }));
    if (file.kind === 'file') {
      throw file.parentId
        ? redirect({ to: '/spaces/$spaceId/files/$fileId', params: { spaceId, fileId: file.parentId }, replace: true })
        : redirect({ to: '/spaces/$spaceId', params: { spaceId }, replace: true });
    }
    await queryClient.ensureQueryData(folderQuery(spaceId, fileId));
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'NOT_FOUND') throw notFound();
    throw error;
  }
}
