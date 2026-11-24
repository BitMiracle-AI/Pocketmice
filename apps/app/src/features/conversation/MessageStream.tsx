import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Marker, MarkerContent } from '@/components/ui/marker';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
  useMessageScroller
} from '@/components/ui/message-scroller';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePageVisible } from '@/hooks/usePageVisible';
import { formatDay } from '@/lib/format';
import { type Conversation, type ConversationMember, type Message, markRead, removeMessage } from './conversations';
import { MessageRow } from './MessageRow';
import { layOut } from './messageLayout';
import { conversationText } from './text';

/** How much of what was read is left in view above the line of what is new, where a conversation opens there, in pixels */
const READ_IN_VIEW_PX = 64;

/**
 * The messages of a conversation, the latest at the bottom. The page begins there and stays there while the person
 * is there: a message that arrives is shown under the others. Someone who is further up is left where they are,
 * with a button that takes them down: someone who has scrolled up, and someone who opened a conversation with
 * more unread messages than fit, which begins at the first of those.
 * messages are the ones the page holds; earlier is there when the conversation has more before them, and shows
 * them. firstUnread is the number of the first message the person had not read when they opened the conversation,
 * or null: a line marks what is new from there, or from the first message the page holds when that is later.
 * It sits inside the provider of the scroller, which the page shares with the field a message is written in.
 */
export function MessageStream({
  conversation,
  members,
  messages,
  firstUnread,
  earlier
}: {
  conversation: Conversation;
  members: readonly ConversationMember[];
  messages: readonly Message[];
  firstUnread: number | null;
  earlier: { busy: boolean; show: () => void } | undefined;
}) {
  const space = useCurrentSpace();
  const user = useCurrentUser();
  // The message the person is asked about deleting
  const [asking, setAsking] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const items = useMemo(() => layOut(messages, firstUnread), [messages, firstUnread]);

  const viewport = useRef<HTMLDivElement>(null);
  const { scrollToMessage } = useMessageScroller();
  // Where the page opens. Left alone, the scroller puts it at its end. When what the person has not read is more
  // than fits above the end, it opens at the message under the line of what is new instead, with a little of what
  // was read above it. Once, when the messages are first drawn: the scroller hands out the same function every
  // time, and the line that moves when earlier messages are shown takes nobody with it
  useLayoutEffect(() => {
    const scrolled = viewport.current;
    const first = scrolled?.querySelector('[data-unread-line]')?.closest('[data-message-id]');
    const id = first?.getAttribute('data-message-id');
    if (!scrolled || !first || !id) return;
    const before = first.getBoundingClientRect().top - scrolled.getBoundingClientRect().top + scrolled.scrollTop;
    if (scrolled.scrollHeight - before > scrolled.clientHeight) {
      scrollToMessage(id, { align: 'start', scrollMargin: READ_IN_VIEW_PX });
    }
  }, [scrollToMessage]);
  useReadMark(space.id, conversation, messages.at(-1)?.number ?? 0, viewport);

  const nameOf = (userId: string) =>
    members.find((member) => member.userId === userId)?.name ?? conversationText.formerMember;

  const confirm = async () => {
    if (!asking || deleting) return;
    setDeleting(true);
    const problem = await removeMessage(space.id, conversation.id, asking.number);
    setDeleting(false);
    setAsking(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <MessageScroller className="flex-1">
      <MessageScrollerViewport ref={viewport} aria-label={conversationText.messagesLabel(conversation.title)}>
        {/* Above the messages and not among them: the scroller keeps the person's place by the messages it holds */}
        {earlier && (
          <div className="flex justify-center pt-4">
            <Button variant="secondary" size="sm" disabled={earlier.busy} onClick={earlier.show}>
              {earlier.busy && <Spinner data-icon="inline-start" />}
              {conversationText.showEarlier}
            </Button>
          </div>
        )}
        <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-0 px-4 pb-4">
          {messages.length === 0 && (
            <p className="m-auto max-w-sm px-6 text-center text-sm text-pretty text-muted-foreground">
              {conversationText.noMessagesHint}
            </p>
          )}
          {items.map(({ message, newDay, firstUnread, head }) => (
            <MessageScrollerItem key={message.number} messageId={String(message.number)}>
              {newDay && (
                <Marker variant="separator" className="pt-4 text-xs">
                  <MarkerContent>{formatDay(message.createdAt)}</MarkerContent>
                </Marker>
              )}
              {firstUnread && (
                <Marker
                  variant="separator"
                  data-unread-line=""
                  className="pt-4 before:bg-primary/30 after:bg-primary/30"
                >
                  <MarkerContent>
                    <Badge>{conversationText.newMessages}</Badge>
                  </MarkerContent>
                </Marker>
              )}
              <MessageRow
                spaceId={space.id}
                conversationId={conversation.id}
                message={message}
                head={head}
                // What the person typed themselves, and not what an agent sent with a key of theirs
                mine={message.user.id === user.id && message.apiKey === null}
                nameOf={nameOf}
                // Whoever sent it, and the owner of the space
                onDelete={message.user.id === user.id || space.role === 'owner' ? () => setAsking(message) : undefined}
              />
            </MessageScrollerItem>
          ))}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && !deleting && setAsking(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{conversationText.deleteMessageTitle}</AlertDialogTitle>
            <AlertDialogDescription>{conversationText.deleteMessageDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{conversationText.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirm}>
              {deleting && <Spinner data-icon="inline-start" />}
              {conversationText.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MessageScroller>
  );
}

/**
 * Says how far the person has read: up to the last message the page shows, once that message is in view and the
 * page is in front. A conversation opens at its end, or at the first unread message when the end is further than
 * fits: the rest is read when the person has come to the end. What they send themselves is read the same way:
 * sending moves nothing on the server.
 * Nothing is said for someone who is no member: the owner of the space, reading.
 */
function useReadMark(
  spaceId: string,
  conversation: Conversation,
  lastShown: number,
  viewport: RefObject<HTMLDivElement | null>
): void {
  const visible = usePageVisible();
  // The number last said, so that it is said once and not again until the answer is there
  const said = useRef(0);
  const { id, lastReadNumber } = conversation;

  useEffect(() => {
    const scrolled = viewport.current;
    if (!scrolled || lastReadNumber === null || !visible || lastShown <= lastReadNumber) return;
    const look = () => {
      if (lastShown <= said.current) return;
      const last = scrolled.querySelector(`[data-message-id="${lastShown}"]`);
      // In view to its last line, give or take a pixel of rounding
      if (!last || last.getBoundingClientRect().bottom > scrolled.getBoundingClientRect().bottom + 1) return;
      said.current = lastShown;
      void markRead(spaceId, id, lastShown);
    };
    // Now, where the page has opened or a message has just been put under the others; and whenever the person, or
    // the page following the conversation, moves what is in view
    look();
    scrolled.addEventListener('scroll', look, { passive: true });
    return () => scrolled.removeEventListener('scroll', look);
  }, [spaceId, id, lastReadNumber, lastShown, visible, viewport]);
}
