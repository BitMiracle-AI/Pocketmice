import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ConversationGonePage } from '@/features/conversation/ConversationGonePage';
import { ConversationPage } from '@/features/conversation/ConversationPage';
import { loadConversation } from '@/features/conversation/conversations';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';

// One conversation of the space: what was said in it, and the field to say something in.
export const Route = createFileRoute('/_app/spaces/$spaceId/conversations/$conversationId')({
  loader: ({ params }) => loadConversation(params.spaceId, params.conversationId),
  component: OpenConversation,
  notFoundComponent: ConversationGonePage,
  errorComponent: ConversationError
});

function OpenConversation() {
  const { conversationId } = Route.useParams();
  return <ConversationPage conversationId={conversationId} />;
}

/** What is shown in place of a conversation that failed to load: the list next to it stays */
function ConversationError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm">
      <p role="alert" className="text-muted-foreground">
        {thrownText(error)}
      </p>
      <Button variant="outline" onClick={() => router.invalidate()}>
        {commonText.tryAgain}
      </Button>
    </div>
  );
}
