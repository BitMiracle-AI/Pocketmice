import { createFileRoute } from '@tanstack/react-router';
import { FilesPage } from '@/features/file/FilesPage';
import { loadFiles } from '@/features/file/loadFiles';
import { wordsOf } from '@/features/file/searchWords';
import { PageError } from '@/features/shell/PageError';

// The files of the space, with nothing picked: what is directly in it. The words being looked for are in the
// address (?q=…).
export const Route = createFileRoute('/_app/spaces/$spaceId/')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({ q: wordsOf(search.q) }),
  loader: ({ params }) => loadFiles(params.spaceId, null),
  component: SpaceFiles,
  errorComponent: PageError
});

function SpaceFiles() {
  const { q } = Route.useSearch();
  return <FilesPage fileId={null} words={q ?? ''} />;
}
