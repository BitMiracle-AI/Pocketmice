import {
  ArrowLeft01Icon,
  Delete02Icon,
  Logout03Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  UserMultiple02Icon
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { MessageScrollerProvider } from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLastGiven } from '@/hooks/useLastGiven';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';
import { Composer } from './Composer';
import { ConversationGonePage } from './ConversationGonePage';
import { ConversationMembersDialog } from './ConversationMembersDialog';
import {
  addToConversation,
  type Conversation,
  type ConversationMember,
  conversationQuery,
  conversationsChanged,
  exitConversation,
  messagesQuery,
  removeConversation
} from './conversations';
import { MessageStream } from './MessageStream';
import { earlierStart, firstUnreadNumber, windowStart } from './messageLayout';
import { RenameConversationDialog } from './RenameConversationDialog';
import { conversationText } from './text';

/**
 * The page of one conversation: what it is called and who is in it, what was said, and the field to say something
 * in. Its route has made sure the person can read it.
 * A conversation can be gone for the person while the page is open: it was deleted, or they were taken out of it.
 * The page hears of it, asks, and says so in place of the conversation.
 */
export function ConversationPage({ conversationId }: { conversationId: string }) {
  const space = useCurrentSpace();
  const found = useSuspenseQuery(conversationQuery(space.id, conversationId));
  // The person is leaving or deleting it themselves, and the api has not answered yet: the page goes elsewhere when
  // it has, and does not say on the way that the conversation is gone
  const [going, setGoing] = useState(false);

  if (found.error?.code === 'UNKNOWN_CONVERSATION' && !going) return <ConversationGonePage />;
  const { conversation, members } = found.data;
  // What the page keeps of a conversation (how far back it shows, where the unread began) starts over with another
  return (
    <OpenConversation
      key={conversation.id}
      conversation={conversation}
      members={members}
      going={going}
      onGoing={setGoing}
    />
  );
}

/** What the person is being asked about: leaving the conversation, or deleting it */
type Asking = 'leave' | 'delete' | null;

function OpenConversation({
  conversation,
  members,
  going,
  onGoing
}: {
  conversation: Conversation;
  members: readonly ConversationMember[];
  going: boolean;
  onGoing: (going: boolean) => void;
}) {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const navigate = useNavigate();
  // The messages the page shows are the ones after this number: it moves back when earlier ones are asked for
  const [after, setAfter] = useState(() => windowStart(conversation.lastMessageNumber));
  // The first message the person had not read when they opened the conversation: where the line of what is new
  // stays, whatever they read and whatever arrives from then on
  const [firstUnread] = useState(() => firstUnreadNumber(conversation));
  const [renaming, setRenaming] = useState(false);
  const [showingMembers, setShowingMembers] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const [joining, setJoining] = useState(false);
  const asked = useLastGiven(asking);
  // While earlier messages are on their way, the ones there are stay
  const held = useQuery({ ...messagesQuery(space.id, conversation.id, after), placeholderData: keepPreviousData });

  const isOwner = space.role === 'owner';
  // The owner of the space reads a conversation they are no member of, and says nothing in it
  const isMember = conversation.lastReadNumber !== null;

  const toList = () => navigate({ to: '/spaces/$spaceId/conversations', params: { spaceId: space.id }, replace: true });

  const confirm = async () => {
    if (!asking || going) return;
    onGoing(true);
    const problem =
      asking === 'leave'
        ? await exitConversation(space.id, conversation.id)
        : await removeConversation(space.id, conversation.id);
    if (problem !== null) {
      onGoing(false);
      setAsking(null);
      return toast.add({ type: 'error', title: problem });
    }
    // The owner of the space who leaves still reads the conversation, and stays on its page. Anyone else, and
    // whoever deleted it, goes to the list; the page leaves the conversation before the cache hears that it is gone
    if (asking === 'delete' || !isOwner) await toList();
    conversationsChanged(space.id, conversation.id);
    toast.add({
      title:
        asking === 'leave' ? conversationText.left(conversation.title) : conversationText.deleted(conversation.title)
    });
    onGoing(false);
    setAsking(null);
  };

  const join = async () => {
    if (joining) return;
    setJoining(true);
    const problem = await addToConversation(space.id, conversation.id, user.id);
    setJoining(false);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <MessageScrollerProvider autoScroll>
      <header className="flex h-12 shrink-0 items-center gap-1 px-3">
        {/* Where the list has no room next to the conversation, this is the way back to it */}
        <Link
          to="/spaces/$spaceId/conversations"
          params={{ spaceId: space.id }}
          aria-label={conversationText.backToList}
          title={conversationText.backToList}
          className={buttonVariants({
            variant: 'ghost',
            size: 'icon-sm',
            className: 'text-muted-foreground @3xl:hidden'
          })}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{conversation.title}</h1>
        <Button
          variant="ghost"
          size="sm"
          aria-label={conversationText.membersCount(members.length)}
          title={conversationText.membersCount(members.length)}
          onClick={() => setShowingMembers(true)}
          className="text-muted-foreground tabular-nums"
        >
          <HugeiconsIcon icon={UserMultiple02Icon} strokeWidth={2} data-icon="inline-start" />
          {members.length}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={conversationText.more}
                className="text-muted-foreground"
              />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={() => setRenaming(true)}>
              <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
              {conversationText.rename}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowingMembers(true)}>
              <HugeiconsIcon icon={UserMultiple02Icon} strokeWidth={2} />
              {conversationText.membersTitle}
            </DropdownMenuItem>
            {(isMember || isOwner) && <DropdownMenuSeparator />}
            {isMember && (
              <DropdownMenuItem onClick={() => setAsking('leave')}>
                <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
                {conversationText.leave}
              </DropdownMenuItem>
            )}
            {/* What cannot be undone is the owner's alone */}
            {isOwner && (
              <DropdownMenuItem variant="destructive" onClick={() => setAsking('delete')}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                {conversationText.deleteConversation}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {held.data === undefined ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm">
          {held.isError ? (
            <>
              <p role="alert" className="text-muted-foreground">
                {thrownText(held.error)}
              </p>
              <Button variant="outline" onClick={() => held.refetch()}>
                {commonText.tryAgain}
              </Button>
            </>
          ) : (
            <Spinner />
          )}
        </div>
      ) : (
        <MessageStream
          conversation={conversation}
          members={members}
          messages={held.data}
          firstUnread={firstUnread}
          earlier={
            // The first message the page holds says whether there are earlier ones. What it holds may still be the
            // messages it had, while the earlier ones asked for are on their way
            (held.data[0]?.number ?? 1) > 1
              ? { busy: held.isPlaceholderData, show: () => setAfter(earlierStart(after)) }
              : undefined
          }
        />
      )}

      {isMember ? (
        <Composer spaceId={space.id} conversationId={conversation.id} members={members} />
      ) : (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
          <div className="flex items-center gap-3 rounded-2xl border border-dashed py-2.5 pr-2.5 pl-4 text-sm">
            <p className="min-w-0 flex-1 text-pretty text-muted-foreground">{conversationText.readingAsOwner}</p>
            <Button variant="outline" disabled={joining} onClick={join}>
              {joining && <Spinner data-icon="inline-start" />}
              {conversationText.join}
            </Button>
          </div>
        </div>
      )}

      <RenameConversationDialog
        spaceId={space.id}
        conversation={conversation}
        open={renaming}
        onOpenChange={setRenaming}
      />
      <ConversationMembersDialog
        open={showingMembers}
        onOpenChange={setShowingMembers}
        conversation={conversation}
        members={members}
      />
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && !going && setAsking(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {asked === 'leave'
                ? conversationText.leaveTitle(conversation.title)
                : conversationText.deleteTitle(conversation.title)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {asked === 'delete'
                ? conversationText.deleteDescription
                : isOwner
                  ? conversationText.leaveDescriptionOwner
                  : conversationText.leaveDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={going}>{conversationText.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={going} onClick={confirm}>
              {going && <Spinner data-icon="inline-start" />}
              {asked === 'leave' ? conversationText.leave : conversationText.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MessageScrollerProvider>
  );
}
