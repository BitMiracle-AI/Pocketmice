import { createFileRoute } from '@tanstack/react-router';
import { FileGonePage } from '@/features/file/FileGonePage';
import { FilesPage } from '@/features/file/FilesPage';
import { wordsOf } from '@/features/file/searchWords';
import { PageError } from '@/features/shell/PageError';

// The files of the space: /files is what is directly in it, with nothing picked, and /files/<id> has a file or a
// folder of it picked, with the folders down to it. The two are one route, so the page that is showing stays as
// it is when something is picked or let go of: its columns, and how far each was scrolled. The words being looked
// for are in the address too (?q=…).
// Nothing is read before the page is shown: a pick shows at once, and the page reads what it is.
export const Route = createFileRoute('/_app/spaces/$spaceId/files/{-$fileId}')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({ q: wordsOf(search.q) }),
  component: SpaceFiles,
  // For an address that goes on after the id (/files/<id>/more), which is the address of no page. With it named
  // here the router leaves such an address to this route, and the page shows what the address says up to there:
  // the pick, or that there is nothing at it. Without it, it is a page that was not found
  notFoundComponent: FileGonePage,
  errorComponent: PageError
});

function SpaceFiles() {
  const { fileId } = Route.useParams();
  const { q } = Route.useSearch();
  return <FilesPage fileId={fileId ?? null} words={q ?? ''} />;
}
