import { createFileRoute } from '@tanstack/react-router';
import { SearchPage } from '@/features/file/SearchPage';

// Looking for a file of the space by words. What is looked for is in the address (?q=…). The router reads 2026
// there as a number and true as a yes: whatever it made of it is taken as the words it was written as.
export const Route = createFileRoute('/_app/spaces/$spaceId/search')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const words = ['string', 'number', 'boolean'].includes(typeof search.q) ? String(search.q).trim() : '';
    return { q: words === '' ? undefined : words };
  },
  component: SearchRoute
});

function SearchRoute() {
  const { q } = Route.useSearch();
  return <SearchPage words={q ?? ''} />;
}
