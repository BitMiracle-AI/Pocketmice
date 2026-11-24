import { createFileRoute } from '@tanstack/react-router';
import { FileGonePage } from '@/features/file/FileGonePage';
import { FilesPage } from '@/features/file/FilesPage';
import { loadPicked } from '@/features/file/files';
import { wordsOf } from '@/features/file/searchWords';
import { PageError } from '@/features/shell/PageError';

// The files of the space: /files is what is directly in it, with nothing picked, and /files/<id> has a file or a
// folder of it picked, with the folders down to it. The two are one route, so the page that is showing stays as
// it is when something is picked or let go of: its columns, and how far each was scrolled. The words being looked
// for are in the address too (?q=…).
export const Route = createFileRoute('/_app/spaces/$spaceId/files/{-$fileId}')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({ q: wordsOf(search.q) }),
  loader: ({ params }) => (params.fileId === undefined ? undefined : loadPicked(params.spaceId, params.fileId)),
  component: SpaceFiles,
  notFoundComponent: FileGonePage,
  errorComponent: PageError
});

function SpaceFiles() {
  const { fileId } = Route.useParams();
  const { q } = Route.useSearch();
  return <FilesPage fileId={fileId ?? null} words={q ?? ''} />;
}
