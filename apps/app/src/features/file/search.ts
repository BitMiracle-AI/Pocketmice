import { getMatchingFiles } from '@pocketmice/contract/domains/file';
import { readPages } from '@/lib/api';

// Looking for a file by words, for when it is not known where it is. The api looks at what files and folders are
// called and how they are described, in the whole space: not at what a file holds.

/**
 * The files and folders of a space that have every word of words in their name or their description, the latest
 * changed first, a page at a time.
 */
export function matchesQuery(spaceId: string, words: string) {
  return readPages(getMatchingFiles, { spaceId, folderId: null, query: words });
}
