import { createFileRoute } from '@tanstack/react-router';
import { SearchPage } from '@/features/file/SearchPage';
import { wordsOf } from '@/features/file/searchWords';

// Looking for a file of the space by words. What is looked for is in the address (?q=…).
export const Route = createFileRoute('/_app/spaces/$spaceId/search')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({ q: wordsOf(search.q) }),
  component: SearchRoute
});

function SearchRoute() {
  const { q } = Route.useSearch();
  return <SearchPage words={q ?? ''} />;
}
