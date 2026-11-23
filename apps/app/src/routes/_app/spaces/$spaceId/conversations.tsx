import { createFileRoute, Outlet, useParams } from '@tanstack/react-router';
import { ConversationsFrame } from '@/features/conversation/ConversationsFrame';

// The conversations of the space: the list of them, and next to it the one the address names. Which one is open
// is read from the address here, and nowhere else.
export const Route = createFileRoute('/_app/spaces/$spaceId/conversations')({
  component: ConversationPages
});

function ConversationPages() {
  // Of the route under this one, when the address goes on to a conversation
  const { conversationId } = useParams({ strict: false });
  return (
    <ConversationsFrame openId={conversationId ?? null}>
      <Outlet />
    </ConversationsFrame>
  );
}
