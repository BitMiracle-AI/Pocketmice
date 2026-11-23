import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SpaceShell } from '@/features/space/SpaceShell';
import { loadSpaces } from '@/features/space/spaces';

// Every page of a space is under this route: which space the page is in is read from the address here, and
// nowhere else.
export const Route = createFileRoute('/_app/spaces/$spaceId')({
  loader: ({ params }) => loadSpaces(params.spaceId),
  component: SpacePages
});

function SpacePages() {
  const { spaceId } = Route.useParams();
  return (
    <SpaceShell spaceId={spaceId}>
      <Outlet />
    </SpaceShell>
  );
}
