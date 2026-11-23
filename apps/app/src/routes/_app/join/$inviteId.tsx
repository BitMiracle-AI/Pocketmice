import { createFileRoute } from '@tanstack/react-router';
import { JoinPage } from '@/features/invite/JoinPage';

// What the link of an invite opens. It is behind the sign-in like every page here: someone who is not signed in
// signs in first, and is brought back to this address.
export const Route = createFileRoute('/_app/join/$inviteId')({
  component: Join
});

function Join() {
  const { inviteId } = Route.useParams();
  return <JoinPage inviteId={inviteId} />;
}
