import { type getFile, getFiles } from '@pocketmice/contract/domains/file';
import type { OutputOf } from '@pocketmice/contract/operation';
import { PAGE_SIZE_MAX } from '@pocketmice/contract/paging';
import { queryOptions } from '@tanstack/react-query';
import { ApiFailure, call } from '@/lib/api';
import { language } from '@/lib/language/language';
import { languageTag } from '@/lib/language/languages';
import { inOrder } from './fileOrder';

// What is in a space: a tree of files and folders. A page shows one folder of it, and which one is in its address:
// /spaces/<space> is what is directly in the space, /spaces/<space>/files/<folder> is a folder.

/** A file or a folder, as the api answers one */
export type DriveFile = OutputOf<typeof getFile>['file'];

/**
 * Everything that is directly in a folder (parentId null: directly in the space), in the order the page shows it.
 * The api gives a folder a page at a time, in the order of the names. All the pages are read here, so that the
 * page can put the folders first and say how many of each there are. A folder with tens of thousands of entries
 * takes long to open that way; that is known and left as it is.
 * It is kept under the name of the operation and the place, as a single call would be: marking what was read from
 * a space as stale (spaceChanged) reaches it too.
 */
export function folderQuery(spaceId: string, parentId: string | null) {
  return queryOptions<DriveFile[], ApiFailure<'NOT_FOUND'>>({
    queryKey: [getFiles.name, { spaceId, parentId }, 'whole'],
    queryFn: async () => {
      const files: DriveFile[] = [];
      let cursor: string | undefined;
      do {
        const page = await call(getFiles, { spaceId, parentId, limit: PAGE_SIZE_MAX, cursor });
        if (!page.ok) throw new ApiFailure<'NOT_FOUND'>(page.code, page.message);
        files.push(...page.data.files);
        cursor = page.data.nextCursor ?? undefined;
      } while (cursor !== undefined);
      return inOrder(files, namesCompare);
    }
  });
}

/** Names as a person of this language expects them in a list: file2 before file10, and a before B */
const namesCompare = new Intl.Collator(languageTag(language), { numeric: true }).compare;
