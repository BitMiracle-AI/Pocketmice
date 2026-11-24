import { Add01Icon, BubbleChatIcon, ViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { type ReactNode, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageBar } from '@/features/shell/PageBar';
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
// the right the conversation that is open (children), which may have a pane of its own to its right. Where there is no room for both, the list is the page until
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
        aria-label={shellText.conversations}
        className={cn(
          'flex min-h-0 w-full flex-col @3xl:w-80 @3xl:shrink-0 @3xl:border-r',
          openId !== null && '@max-3xl:hidden'
        )}
      >
        <PageBar
          title={shellText.conversations}
          actions={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={conversationText.start}
              title={conversationText.start}
              onClick={() => setStarting(true)}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            </Button>
          }
        />

        {isOwner && (
          <div className="flex flex-col gap-2 p-2">
            <Tabs value={all ? 'all' : 'mine'} onValueChange={(value) => setEveryone(value === 'all')}>
              <TabsList className="w-full">
                <TabsTrigger value="mine">{conversationText.mine}</TabsTrigger>
                <TabsTrigger value="all">{conversationText.all}</TabsTrigger>
              </TabsList>
            </Tabs>
            {all && <p className="px-2 text-xs text-pretty text-muted-foreground">{conversationText.allHint}</p>}
          </div>
        )}

        {conversations === undefined ? (
          <Empty>
            {list.isError ? (
              <>
                <EmptyHeader>
                  <EmptyDescription role="alert">{thrownText(list.error)}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={() => list.refetch()}>
                    {commonText.tryAgain}
                  </Button>
                </EmptyContent>
              </>
            ) : (
              <Spinner />
            )}
          </Empty>
        ) : conversations.length === 0 ? (
          // Where the list is the page, it says what a conversation is and starts the first; where something is
          // next to it, only that there are none
          <>
            {openId === null && <NoConversations className="@3xl:hidden" all={all} onStart={() => setStarting(true)} />}
            <p className={cn('p-6 text-center text-sm text-muted-foreground', openId === null && '@max-3xl:hidden')}>
              {all ? conversationText.noneInSpace : conversationText.noneTitle}
            </p>
          </>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <SidebarGroup>
              <SidebarMenu aria-label={conversationText.listLabel}>
                {conversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    spaceId={space.id}
                    conversation={conversation}
                    open={conversation.id === openId}
                  />
                ))}
              </SidebarMenu>
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
            </SidebarGroup>
          </ScrollArea>
        )}
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
    <SidebarMenuItem>
      <SidebarMenuButton
        size="lg"
        isActive={open}
        render={
          <Link
            to="/spaces/$spaceId/conversations/$conversationId"
            params={{ spaceId, conversationId: conversation.id }}
          />
        }
      >
        <div className="grid min-w-0 flex-1 gap-0.5 text-left text-sm leading-tight">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('truncate', unread > 0 ? 'font-semibold' : 'font-medium')}>{conversation.title}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatBrief(conversation.lastMessageAt ?? conversation.createdAt)}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('truncate text-xs text-muted-foreground', (!last || last.deletedAt) && 'italic')}>
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
              <Badge aria-label={conversationText.unread(unread)} className="ml-auto tabular-nums">
                {unread > 99 ? '99+' : unread}
              </Badge>
            )}
            {conversation.lastReadNumber === null && (
              <span title={conversationText.notAMember} className="ml-auto shrink-0 text-muted-foreground">
                <HugeiconsIcon icon={ViewIcon} strokeWidth={2} aria-hidden="true" />
                <span className="sr-only">{conversationText.notAMember}</span>
              </span>
            )}
          </div>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
