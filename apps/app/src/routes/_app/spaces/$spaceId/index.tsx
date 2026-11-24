import { createFileRoute, redirect } from '@tanstack/react-router';

// A space has no page of its own: its address leads to its files.
export const Route = createFileRoute('/_app/spaces/$spaceId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/spaces/$spaceId/files/{-$fileId}', params: { spaceId: params.spaceId }, replace: true });
  }
});
