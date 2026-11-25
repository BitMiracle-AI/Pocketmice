import { ArrowLeft01Icon, SidebarRightIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
import { SidePane } from '@/components/SidePane';
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
import { BackToList, ConversationWaiting } from './ConversationWaiting';
import {
  addToConversation,
  type Conversation,
  type ConversationMember,
  messagesQuery,
  useOpening
} from './conversations';
import { MessageStream } from './MessageStream';
import { earlierStart, firstUnreadNumber, windowStart } from './messageLayout';
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
 * The page. It is there as soon as the person picks a conversation, and says that it waits until the conversation
 * can be shown as it is now (useOpening). fileId is the file the address says is shown beside it, or null; about
 * says the address asks for what the conversation is.
 * A conversation can be gone for the person, when the page opens or while it is open: it never was, it was
 * deleted, or they were taken out of it. The page asks, hears of it, and says so in place of the conversation.
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
  const opening = useOpening(space.id, conversationId);
  // The person is leaving or deleting it themselves, and the api has not answered yet: the page goes elsewhere when
  // it has, and does not say on the way that the conversation is gone
  const [going, setGoing] = useState(false);

  if (opening.gone && !going) return <ConversationGonePage />;
  if (opening.shown === null) return <ConversationWaiting failed={opening.failed} />;
  const { conversation, members } = opening.shown;
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
  const [room, beside] = useIsWide<HTMLDivElement>(PANE_BESIDE_PX);
  // What the pane last showed, for the moment it takes to go
  const shownPane = useLastGiven(pane);
  const shownFile = useLastGiven(fileId);
  const [joining, setJoining] = useState(false);
  // While earlier messages are on their way, the ones there are stay
  const held = useQuery({ ...messagesQuery(space.id, conversation.id, after), placeholderData: keepPreviousData });

  // The owner of the space reads a conversation they are no member of, and says nothing in it
  const isMember = conversation.lastReadNumber !== null;

  /** Shows the conversation with what the conversation is beside it, or with nothing beside it */
  const show = (about: boolean) =>
    navigate({
      to: '/spaces/$spaceId/conversations/$conversationId',
      params: { spaceId: space.id, conversationId: conversation.id },
      search: { about: about ? true : undefined }
    });

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
        <ConversationAbout conversation={conversation} members={members} going={going} onGoing={onGoing} />
      )}
    </>
  );

  return (
    <div ref={room} className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MessageScrollerProvider autoScroll>
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            {/* Where the list has no room next to the conversation, this is the way back to it */}
            <BackToList />
            {/* The page is the conversations of the space, which the bar of the list says: this is one of them */}
            <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{conversation.title}</h2>
            {/* Who is in it at a glance: read out as how many they are, and not as their letters */}
            <AvatarGroup
              role="img"
              aria-label={conversationText.membersCount(members.length)}
              title={conversationText.membersCount(members.length)}
              className="max-sm:hidden"
            >
              {members.slice(0, AVATARS_SHOWN).map((member) => (
                <PersonAvatar key={member.userId} id={member.userId} name={member.name} size="sm" />
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
                    <Button variant="secondary" onClick={() => held.refetch()}>
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
        <SidePane aria-label={paneName} className="w-80 @7xl:w-96">
          {paneContent}
        </SidePane>
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
    </div>
  );
}
