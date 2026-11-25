import { id } from '@pocketmice/contract/id';
import { createFileRoute } from '@tanstack/react-router';
import { ConversationPage } from '@/features/conversation/ConversationPage';
import { ConversationError } from '@/features/conversation/ConversationWaiting';

// One conversation of the space: what was said in it, and the field to say something in. What is shown beside it
// is in the address too: ?file=<id> is a file a message points at, ?about=true is the conversation itself.
// Nothing is read before the page is shown: the page opens the conversation, and says that it waits meanwhile.
export const Route = createFileRoute('/_app/spaces/$spaceId/conversations/$conversationId')({
  // What is no id is no file: the address is then the conversation alone
  validateSearch: (search: Record<string, unknown>): { file?: string; about?: true } => ({
    file: typeof search.file === 'string' && id.safeParse(search.file).success ? search.file : undefined,
    about: search.about === true ? true : undefined
  }),
  component: OpenConversation,
  errorComponent: ConversationError
});

function OpenConversation() {
  const { conversationId } = Route.useParams();
  const { file, about } = Route.useSearch();
  return <ConversationPage conversationId={conversationId} fileId={file ?? null} about={about === true} />;
}
