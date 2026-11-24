import { Link, useNavigate } from '@tanstack/react-router';
import { type ComponentProps, useCallback } from 'react';

// Where the page of the files is, is all in its address: /spaces/<space>/files with nothing picked,
// /spaces/<space>/files/<id> with a file or a folder picked, and ?q= with the words being looked for. Every way
// to that page is written here, so that the three are put together the one way.

/** The page of the files: one route, whether something is picked or not */
const FILES = '/spaces/$spaceId/files/{-$fileId}';

/** What the address says is picked: nothing leaves the id out of it */
const paramsOf = (spaceId: string, fileId: string | null) => ({ spaceId, fileId: fileId ?? undefined });

/** What ?q= says for these words: nothing, when there are none */
const searchOf = (words: string) => ({ q: words === '' ? undefined : words });

/**
 * A link to the files of a space with fileId picked (null: nothing), and words looked for (left out: none).
 * Anything else it is given goes to the link itself, so it can be handed to a component as what to render.
 */
export function FilesLink({
  spaceId,
  fileId,
  words = '',
  ...rest
}: { spaceId: string; fileId: string | null; words?: string } & Omit<ComponentProps<'a'>, 'href'>) {
  return <Link to={FILES} params={paramsOf(spaceId, fileId)} search={searchOf(words)} {...rest} />;
}

/**
 * Goes to the files of a space with fileId picked and words looked for, as FilesLink leads there. replace is for
 * what is typed into the search field: it takes the place of the address before it, so that every letter is not
 * a step of its own in the history.
 */
export function useGoToFiles(spaceId: string) {
  const navigate = useNavigate();
  return useCallback(
    (fileId: string | null, words = '', replace = false) =>
      navigate({ to: FILES, params: paramsOf(spaceId, fileId), search: searchOf(words), replace }),
    [navigate, spaceId]
  );
}
