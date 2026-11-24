import { ArrowLeft01Icon, SidebarRightIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { keepPreviousData, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
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
import { AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { MessageScrollerProvider } from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { fileText } from '@/features/file/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useIsWide } from '@/hooks/useIsWide';
import { useLastGiven } from '@/hooks/useLastGiven';
import { thrownText } from '@/lib/api';
import { commonText } from '@/lib/text';
import { Composer } from './Composer';
import { ConversationAbout } from './ConversationAbout';
import { ConversationFilePane } from './ConversationFilePane';
import { ConversationGonePage } from './ConversationGonePage';
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

// The page of one conversation: what was said, and the field to say something in; and beside it, when the
// address asks for it, a pane: a file a message points at (?file=<id>), shown as the files show what is picked,
// or what the conversation is and who is in it (?about=true). Which of the two is shown is in the address and
// nowhere else, so a step back closes it.
// Where there is room the pane stands beside the conversation; where there is not, it comes in over it: from the
// side of a window that is wide but has no room left, and from the bottom of a phone. The conversation stays as
// it is under it either way: where the person was reading, and what they were writing.

/** How wide the place of a conversation has to be for the pane to stand beside it, in pixels */
const PANE_BESIDE_PX = 672;

/** How many members the top of a conversation shows by their avatars: the rest are counted */
const AVATARS_SHOWN = 3;

/** What the pane beside a conversation shows: a file, or the conversation itself. Null when there is none */
type Pane = 'file' | 'about' | null;

/**
 * The page. Its route has made sure the person can read the conversation. fileId is the file the address says is
 * shown beside it, or null; about says the address asks for what the conversation is.
 * A conversation can be gone for the person while the page is open: it was deleted, or they were taken out of it.
 * The page hears of it, asks, and says so in place of the conversation.
 */
export function ConversationPage({
  conversationId,
  fileId,
  about
}: {
  conversationId: string;
  fileId: string | null;
  about: boolean;
}) {
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
      fileId={fileId}
      pane={fileId !== null ? 'file' : about ? 'about' : null}
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
  fileId,
  pane,
  going,
  onGoing
}: {
  conversation: Conversation;
  members: readonly ConversationMember[];
  fileId: string | null;
  pane: Pane;
  going: boolean;
  onGoing: (going: boolean) => void;
}) {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // The messages the page shows are the ones after this number: it moves back when earlier ones are asked for
  const [after, setAfter] = useState(() => windowStart(conversation.lastMessageNumber));
  // The first message the person had not read when they opened the conversation: where the line of what is new
  // stays, whatever they read and whatever arrives from then on
  const [firstUnread] = useState(() => firstUnreadNumber(conversation));
  const [renaming, setRenaming] = useState(false);
  const [asking, setAsking] = useState<Asking>(null);
  const [room, beside] = useIsWide<HTMLDivElement>(PANE_BESIDE_PX);
  // What the pane last showed, for the moment it takes to go
  const shownPane = useLastGiven(pane);
  const shownFile = useLastGiven(fileId);
  const [joining, setJoining] = useState(false);
  const asked = useLastGiven(asking);
  // While earlier messages are on their way, the ones there are stay
  const held = useQuery({ ...messagesQuery(space.id, conversation.id, after), placeholderData: keepPreviousData });

  const isOwner = space.role === 'owner';
  // The owner of the space reads a conversation they are no member of, and says nothing in it
  const isMember = conversation.lastReadNumber !== null;

  const toList = () => navigate({ to: '/spaces/$spaceId/conversations', params: { spaceId: space.id }, replace: true });
  /** Shows the conversation with what the conversation is beside it, or with nothing beside it */
  const show = (about: boolean) =>
    navigate({
      to: '/spaces/$spaceId/conversations/$conversationId',
      params: { spaceId: space.id, conversationId: conversation.id },
      search: { about: about ? true : undefined }
    });

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

  // What the pane is called, and what it holds: the way back to the conversation alone, then the file or the
  // conversation itself. It is the same pane beside the conversation and over it
  const paneName = shownPane === 'file' ? fileText.details : conversationText.about;
  const paneContent = (
    <>
      <div className="flex h-14 shrink-0 items-center border-b px-2">
        <Button variant="ghost" size="sm" onClick={() => show(false)}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} data-icon="inline-start" />
          {conversationText.closePane}
        </Button>
      </div>
      {shownPane === 'file' && shownFile !== null ? (
        <ConversationFilePane fileId={shownFile} />
      ) : (
        <ConversationAbout
          conversation={conversation}
          members={members}
          onRename={() => setRenaming(true)}
          onAsk={setAsking}
        />
      )}
    </>
  );

  return (
    <div ref={room} className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MessageScrollerProvider autoScroll>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            {/* Where the list has no room next to the conversation, this is the way back to it */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="@3xl:hidden"
              aria-label={conversationText.backToList}
              title={conversationText.backToList}
              nativeButton={false}
              render={
                // The list is where every conversation begins, and is not this page: the link does not say it is
                <Link
                  to="/spaces/$spaceId/conversations"
                  params={{ spaceId: space.id }}
                  activeOptions={{ exact: true }}
                />
              }
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            </Button>
            {/* The page is the conversations of the space, which the bar of the list says: this is one of them */}
            <h2 className="min-w-0 flex-1 truncate text-base font-medium">{conversation.title}</h2>
            {/* Who is in it at a glance: read out as how many they are, and not as their letters */}
            <AvatarGroup
              role="img"
              aria-label={conversationText.membersCount(members.length)}
              title={conversationText.membersCount(members.length)}
              className="max-sm:hidden"
            >
              {members.slice(0, AVATARS_SHOWN).map((member) => (
                <PersonAvatar key={member.userId} name={member.name} size="sm" />
              ))}
              {members.length > AVATARS_SHOWN && (
                <AvatarGroupCount>{conversationText.moreMembers(members.length - AVATARS_SHOWN)}</AvatarGroupCount>
              )}
            </AvatarGroup>
            <Button
              variant={pane === 'about' ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={conversationText.about}
              title={conversationText.about}
              aria-pressed={pane === 'about'}
              onClick={() => show(pane !== 'about')}
            >
              <HugeiconsIcon icon={SidebarRightIcon} strokeWidth={2} />
            </Button>
          </header>

          {held.data === undefined ? (
            <Empty>
              {held.isError ? (
                <>
                  <EmptyHeader>
                    <EmptyDescription role="alert">{thrownText(held.error)}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" onClick={() => held.refetch()}>
                      {commonText.tryAgain}
                    </Button>
                  </EmptyContent>
                </>
              ) : (
                <Spinner />
              )}
            </Empty>
          ) : (
            <MessageStream
              conversation={conversation}
              members={members}
              messages={held.data}
              firstUnread={firstUnread}
              earlier={
                // The first message the page holds says whether there are earlier ones. What it holds may still be
                // the messages it had, while the earlier ones asked for are on their way
                (held.data[0]?.number ?? 1) > 1
                  ? { busy: held.isPlaceholderData, show: () => setAfter(earlierStart(after)) }
                  : undefined
              }
            />
          )}

          {isMember ? (
            <Composer spaceId={space.id} conversationId={conversation.id} members={members} />
          ) : (
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t p-4 text-sm text-muted-foreground">
              {conversationText.readingAsOwner}
              <Button size="sm" disabled={joining} onClick={join}>
                {joining && <Spinner data-icon="inline-start" />}
                {conversationText.join}
              </Button>
            </div>
          )}
        </MessageScrollerProvider>
      </div>

      {pane !== null && beside && (
        <aside aria-label={paneName} className="flex min-h-0 w-80 shrink-0 flex-col border-l @7xl:w-96">
          {paneContent}
        </aside>
      )}
      {!beside && (
        <Drawer
          open={pane !== null}
          onOpenChange={(open) => !open && void show(false)}
          swipeDirection={isMobile ? 'down' : 'right'}
          showSwipeHandle={isMobile}
        >
          <DrawerContent>
            <DrawerHeader className="sr-only">
              <DrawerTitle>{paneName}</DrawerTitle>
              <DrawerDescription>{conversation.title}</DrawerDescription>
            </DrawerHeader>
            {paneContent}
          </DrawerContent>
        </Drawer>
      )}

      <RenameConversationDialog
        spaceId={space.id}
        conversation={conversation}
        open={renaming}
        onOpenChange={setRenaming}
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
    </div>
  );
}
