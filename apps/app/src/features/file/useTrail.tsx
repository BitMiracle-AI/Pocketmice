import { getFileByPath } from '@pocketmice/contract/domains/file';
import { useQueries } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { TrailStep } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import type { Space } from '@/features/space/spaces';
import { readQuery } from '@/lib/api';
import { foldersAbove } from './fileOrder';
import type { DriveFile } from './files';

/**
 * The way from the files of the space down to a file or a folder, for the bar at the top: the folders above it,
 * each a link once its address is known. Null is the space itself, which has no way down to it.
 * The names come from the path, which is there at once. The address of the folder right above is in the file
 * itself; the ones further up are asked for by their paths, and are plain names until the answers are there.
 */
export function useTrail(space: Space, file: DriveFile | null): TrailStep[] {
  const above = file ? foldersAbove(file.path) : [];
  const further = above.slice(0, -1);
  const found = useQueries({
    queries: further.map(({ path }) => readQuery(getFileByPath, { spaceId: space.id, path }))
  });
  if (!file) return [];

  const linkTo = (fileId: string | null | undefined) =>
    fileId ? <Link to="/spaces/$spaceId/files/$fileId" params={{ spaceId: space.id, fileId }} /> : undefined;
  return [
    { label: shellText.files, link: <Link to="/spaces/$spaceId" params={{ spaceId: space.id }} /> },
    ...above.map(({ name }, index) => ({
      label: name,
      link: linkTo(index === above.length - 1 ? file.parentId : found[index]?.data?.file.id)
    }))
  ];
}
