import { getMatchingFiles } from '@pocketmice/contract/domains/file';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { readPages } from '@/lib/api';

// Looking for a file by words, for when it is not known where it is. The api looks at what files and folders are
// called and how they are described, in the whole space: not at what a file holds.

/**
 * The files and folders of a space that have every word of words in their name or their description, the latest
 * changed first, a page at a time.
 */
function matchesQuery(spaceId: string, words: string) {
  return readPages(getMatchingFiles, { spaceId, folderId: null, query: words });
}

/**
 * What words find in a space, as the page of the files reads it: nothing is asked while there are no words, and
 * while other words are being looked for, what the words before found stays. The field and the list both read it.
 */
export function useMatches(spaceId: string, words: string) {
  return useInfiniteQuery({
    ...matchesQuery(spaceId, words),
    enabled: words !== '',
    placeholderData: keepPreviousData
  });
}
