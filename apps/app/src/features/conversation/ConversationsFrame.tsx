import { Add01Icon, BubbleChatIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { thrownText } from '@/lib/api';
import { formatBrief } from '@/lib/format';
import { commonText } from '@/lib/text';
import { allConversationsQuery, type Conversation, conversationsQuery } from './conversations';
import { unreadCount } from './messageLayout';
import { NewConversationDialog } from './NewConversationDialog';
import { conversationText } from './text';

// What every page of the conversations of a space is inside of: the list of the conversations on the left, and on
// the right the conversation that is open (children). Where there is no room for both, the list is the page until
// a conversation is opened, and the conversation is the page from then on. Room is the width of the frame, not of
// the window: the sidebar may be open or away.
// A list with nothing in it says so where there is room: next to the list when both are shown, in the place of the
// list when the list is the page.
// The list is the conversations the person is in. The owner of the space can switch it to every conversation of
// the space, which they can read without being in them; which of the two is shown is kept while the person stays
// among the conversations, and is theirs again the next time they come.

/** How much of a message a row of the list is given to show, in characters: the row cuts it where its room ends */
const PREVIEW_LENGTH = 200;

/** openId is the conversation the address names, or null when it names none */
export function ConversationsFrame({ openId, children }: { openId: string | null; children: ReactNode }) {
  const space = useCurrentSpace();
  const isOwner = space.role === 'owner';
  const [everyone, setEveryone] = useState(false);
  const [starting, setStarting] = useState(false);
  const all = isOwner && everyone;
  const mine = useInfiniteQuery(conversationsQuery(space.id));
  const every = useInfiniteQuery({ ...allConversationsQuery(space.id), enabled: all });
  const list = all ? every : mine;
  const conversations = list.data?.pages.flatMap((page) => page.conversations);
  const none = conversations?.length === 0;

  return (
    <div className="@container flex min-h-0 flex-1">
      <aside
        className={cn(
          'flex min-h-0 w-full flex-col @3xl:w-80 @3xl:shrink-0 @3xl:border-r',
          openId !== null && '@max-3xl:hidden'
        )}
      >
        <MainBar trail={[]} title={shellText.conversations}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={conversationText.start}
            title={conversationText.start}
            onClick={() => setStarting(true)}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          </Button>
        </MainBar>

        {isOwner && (
          <div className="flex flex-col gap-2 px-3 pb-2">
            <Tabs value={all ? 'all' : 'mine'} onValueChange={(value) => setEveryone(value === 'all')}>
              <TabsList className="w-full">
                <TabsTrigger value="mine">{conversationText.mine}</TabsTrigger>
                <TabsTrigger value="all">{conversationText.all}</TabsTrigger>
              </TabsList>
            </Tabs>
            {all && <p className="px-1 text-xs text-pretty text-muted-foreground">{conversationText.allHint}</p>}
          </div>
        )}

        <nav aria-label={conversationText.listLabel} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
          {conversations === undefined ? (
            list.isError ? (
              <p role="alert" className="px-3 py-6 text-center text-sm text-muted-foreground">
                {thrownText(list.error)}{' '}
                <button type="button" className="underline underline-offset-3" onClick={() => list.refetch()}>
                  {commonText.tryAgain}
                </button>
              </p>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <Spinner />
              </div>
            )
          ) : conversations.length === 0 ? (
            // Where the list is the page, it says what a conversation is and starts the first; where something is
            // next to it, only that there are none
            <>
              {openId === null && (
                <NoConversations className="pb-24 @3xl:hidden" all={all} onStart={() => setStarting(true)} />
              )}
              <p
                className={cn(
                  'px-3 py-6 text-center text-sm text-muted-foreground',
                  openId === null && '@max-3xl:hidden'
                )}
              >
                {all ? conversationText.noneInSpace : conversationText.noneTitle}
              </p>
            </>
          ) : (
            <>
              <ul className="flex flex-col gap-0.5">
                {conversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    spaceId={space.id}
                    conversation={conversation}
                    open={conversation.id === openId}
                  />
                ))}
              </ul>
              {list.hasNextPage && (
                <div className="flex justify-center pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={list.isFetchingNextPage}
                    onClick={() => list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                    {conversationText.showMore}
                  </Button>
                </div>
              )}
            </>
          )}
        </nav>
      </aside>

      <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col', openId === null && '@max-3xl:hidden')}>
        {/* With no conversation open and none to pick, the room next to the list says so */}
        {openId === null && none ? <NoConversations all={all} onStart={() => setStarting(true)} /> : children}
      </section>

      <NewConversationDialog spaceId={space.id} open={starting} onOpenChange={setStarting} />
    </div>
  );
}

/** What is said where there are no conversations: what one is, and the way to start the first */
function NoConversations({ all, onStart, className }: { all: boolean; onStart: () => void; className?: string }) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={BubbleChatIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{all ? conversationText.noneInSpace : conversationText.noneTitle}</EmptyTitle>
        <EmptyDescription>{conversationText.noneHint}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onStart}>
          {conversationText.start}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * One conversation in the list: its title, when it last had a message, how that message begins, and how many
 * messages the person has not read. One the person is not in (the owner, looking at them all) is marked as only
 * read. open says that it is the one the page shows.
 */
function ConversationRow({
  spaceId,
  conversation,
  open
}: {
  spaceId: string;
  conversation: Conversation;
  open: boolean;
}) {
  const user = useCurrentUser();
  const unread = unreadCount(conversation);
  const last = conversation.lastMessage;

  return (
    <li>
      <Link
        to="/spaces/$spaceId/conversations/$conversationId"
        params={{ spaceId, conversationId: conversation.id }}
        aria-current={open ? 'page' : undefined}
        className={cn(
          'flex flex-col gap-0.5 rounded-xl px-3 py-2 text-sm outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/30',
          open && 'bg-muted'
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className={cn('min-w-0 flex-1 truncate', unread > 0 ? 'font-semibold' : 'font-medium')}>
            {conversation.title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatBrief(conversation.lastMessageAt ?? conversation.createdAt)}
          </span>
        </span>
        <span className="flex h-5 items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-muted-foreground', (!last || last.deletedAt) && 'italic')}>
            {!last
              ? conversationText.noMessages
              : last.deletedAt !== null
                ? conversationText.deletedMessage
                : conversationText.preview(
                    last.apiKey ? last.apiKey.name : last.user.id === user.id ? conversationText.you : last.user.name,
                    last.text.slice(0, PREVIEW_LENGTH)
                  )}
          </span>
          {unread > 0 && (
            <Badge aria-label={conversationText.unread(unread)} className="h-5 min-w-5 px-1.5 tabular-nums">
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
          {conversation.lastReadNumber === null && (
            <span title={conversationText.notAMember} className="shrink-0 text-muted-foreground">
              <HugeiconsIcon icon={ViewIcon} strokeWidth={2} aria-hidden="true" className="size-4" />
              <span className="sr-only">{conversationText.notAMember}</span>
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
