import { createFileRoute } from '@tanstack/react-router';
import { SpacesPage } from '@/features/space/SpacesPage';
import { spacesQuery } from '@/features/space/spaces';
import { queryClient } from '@/lib/api';

// The start: the spaces the person is in, for them to pick one, or the form that makes their first.
export const Route = createFileRoute('/_app/')({
  loader: () => queryClient.ensureQueryData(spacesQuery),
  component: SpacesPage
});
