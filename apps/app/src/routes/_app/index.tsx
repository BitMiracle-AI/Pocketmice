import { createFileRoute, redirect } from '@tanstack/react-router';
import { FirstSpacePage } from '@/features/space/FirstSpacePage';
import { spacesQuery } from '@/features/space/spaces';
import { queryClient } from '@/lib/api';

// The start. Someone who is in a space is taken to the first one they joined; someone who is in none is asked to
// make one, here.
export const Route = createFileRoute('/_app/')({
  beforeLoad: async () => {
    const { spaces } = await queryClient.fetchQuery(spacesQuery);
    const [first] = spaces;
    if (first) throw redirect({ to: '/spaces/$spaceId', params: { spaceId: first.id }, replace: true });
  },
  component: FirstSpacePage
});
