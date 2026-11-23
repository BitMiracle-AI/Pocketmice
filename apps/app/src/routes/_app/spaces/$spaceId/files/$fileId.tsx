import { createFileRoute } from '@tanstack/react-router';
import { FileGonePage } from '@/features/file/FileGonePage';
import { FilesPage } from '@/features/file/FilesPage';
import { loadFiles } from '@/features/file/loadFiles';
import { wordsOf } from '@/features/file/searchWords';
import { PageError } from '@/features/shell/PageError';

// The files of the space with a file or a folder of it picked: the folders down to it, and what it is. The words
// being looked for are in the address (?q=…).
export const Route = createFileRoute('/_app/spaces/$spaceId/files/$fileId')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({ q: wordsOf(search.q) }),
  loader: ({ params }) => loadFiles(params.spaceId, params.fileId),
  component: PickedFile,
  notFoundComponent: FileGonePage,
  errorComponent: PageError
});

function PickedFile() {
  const { fileId } = Route.useParams();
  const { q } = Route.useSearch();
  return <FilesPage fileId={fileId} words={q ?? ''} />;
}
