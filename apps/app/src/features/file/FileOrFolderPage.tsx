import { getFile } from '@pocketmice/contract/domains/file';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { readQuery } from '@/lib/api';
import { FileGonePage } from './FileGonePage';
import { FilePage } from './FilePage';
import { FolderPage } from './FolderPage';

/**
 * What the address of a file shows: /spaces/<space>/files/<id> is the page of a folder when the id is a folder's,
 * and the page of a file when it is a file's. One address for both, because a file and a folder are the same
 * kind of thing with the same kind of id; which it is, is read from what the api says of it.
 * Its route has made sure there is such a file. One that has gone since (into the trash, or for good; by the
 * person a page ago, or by someone else while this page is open) is still in the cache as it was, next to the
 * answer that it is not there: the page goes by that answer, as the route does for an address with nothing at it.
 */
export function FileOrFolderPage({ fileId }: { fileId: string }) {
  const space = useCurrentSpace();
  const { data, error } = useSuspenseQuery(readQuery(getFile, { spaceId: space.id, fileId }));
  if (error?.code === 'NOT_FOUND') return <FileGonePage />;
  const { file } = data;
  return file.kind === 'folder' ? <FolderPage folder={file} /> : <FilePage file={file} />;
}
