import { createFileRoute } from '@tanstack/react-router';
import { NoConversationPage } from '@/features/conversation/NoConversationPage';

// The conversations of the space, with none of them open.
export const Route = createFileRoute('/_app/spaces/$spaceId/conversations/')({
  component: NoConversationPage
});
