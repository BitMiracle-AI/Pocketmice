import { id } from '@pocketmice/contract/id';
import { createFileRoute, type ErrorComponentProps, useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { ConversationGonePage } from '@/features/conversation/ConversationGonePage';
import { ConversationPage } from '@/features/conversation/ConversationPage';
import { loadConversation } from '@/features/conversation/conversations';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';

// One conversation of the space: what was said in it, and the field to say something in. What is shown beside it
// is in the address too: ?file=<id> is a file a message points at, ?about=true is the conversation itself.
export const Route = createFileRoute('/_app/spaces/$spaceId/conversations/$conversationId')({
  // What is no id is no file: the address is then the conversation alone
  validateSearch: (search: Record<string, unknown>): { file?: string; about?: true } => ({
    file: typeof search.file === 'string' && id.safeParse(search.file).success ? search.file : undefined,
    about: search.about === true ? true : undefined
  }),
  loader: {
    handler: ({ params }) => loadConversation(params.spaceId, params.conversationId),
    // The page decides as it opens where what the person has not read begins, from the conversation as it is
    // then. So it waits for the conversation each time it is opened, also one it has shown before: the router
    // would otherwise show such a page at once, with what was read the last time, and load behind it
    staleReloadMode: 'blocking'
  },
  component: OpenConversation,
  notFoundComponent: ConversationGonePage,
  errorComponent: ConversationError
});

function OpenConversation() {
  const { conversationId } = Route.useParams();
  const { file, about } = Route.useSearch();
  return <ConversationPage conversationId={conversationId} fileId={file ?? null} about={about === true} />;
}

/** What is shown in place of a conversation that failed to load: the list next to it stays */
function ConversationError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <Empty>
      <EmptyHeader>
        <EmptyDescription role="alert">{thrownText(error)}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={() => router.invalidate()}>
          {commonText.tryAgain}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
