import type { Conversation, Message } from './conversations.ts';

// How the messages of a conversation are laid out on its page, and which of them the page asks for. These are
// rules and know nothing of the browser: the page draws what they say.

/** The window of messages a page opens a conversation with begins at a multiple of this many */
export const WINDOW_STEP = 50;

/**
 * Where the messages a page opens a conversation with begin: the number they come after. It is the latest
 * WINDOW_STEP messages and up to as many again before them, so that the window begins at a multiple of
 * WINDOW_STEP: a conversation that grows is then asked for under the same window for a while, and coming back
 * to it finds its messages in the cache.
 */
export function windowStart(lastMessageNumber: number): number {
  return Math.max(0, (Math.ceil(lastMessageNumber / WINDOW_STEP) - 2) * WINDOW_STEP);
}

/** Where a window begins that shows WINDOW_STEP earlier messages than the one that begins after afterNumber */
export function earlierStart(afterNumber: number): number {
  return Math.max(0, afterNumber - WINDOW_STEP);
}

/**
 * How many messages of a conversation the person has not read. None for a conversation they are no member of:
 * the owner of the space reads it, and has no place in it that moves.
 */
export function unreadCount(conversation: Pick<Conversation, 'lastMessageNumber' | 'lastReadNumber'>): number {
  if (conversation.lastReadNumber === null) return 0;
  return Math.max(0, conversation.lastMessageNumber - conversation.lastReadNumber);
}

/**
 * The number of the first message of a conversation that the person has not read, or null when there is none:
 * they have read all of it, or are no member of it. A page asks this once, when it opens the conversation: from
 * that message on is what is new (see layOut for where the line that says so stands). What arrives while the
 * person looks on is no part of it.
 */
export function firstUnreadNumber(
  conversation: Pick<Conversation, 'lastMessageNumber' | 'lastReadNumber'>
): number | null {
  return unreadCount(conversation) > 0 ? (conversation.lastReadNumber ?? 0) + 1 : null;
}

/** Messages of one sender that follow each other within this long are shown as one run, in milliseconds */
export const RUN_GAP_MS = 5 * 60_000;

/**
 * A message as the page of a conversation shows it, with what stands above it. Each is one piece of the page, and
 * what stands above a message is part of its piece: the page keeps its place by its messages when earlier ones
 * are put before them.
 */
export interface StreamItem {
  message: Message;
  /** It was sent on another day than the one before it, or is the first there is: the day is said above it */
  newDay: boolean;
  /**
   * It is the first one on the page that the person had not read when they opened the conversation: a line says
   * so above it, and the page opens there when what is new does not fit above its end
   */
  firstUnread: boolean;
  /** It begins a run: it is shown with who sent it and when */
  head: boolean;
}

/** Who sent a message: the person, and the API key when an agent sent it for them */
function senderOf(message: Message): string {
  return `${message.user.id} ${message.apiKey?.id ?? ''}`;
}

/** The day a time is on, where the person is */
function localDay(time: string): string {
  return new Date(time).toDateString();
}

/**
 * Lays out messages, given in the order they were sent. firstUnread is the number of the first message the person
 * had not read when they opened the conversation (firstUnreadNumber), or null. dayOf says which day a time is on,
 * for a test to say.
 * The line of what is new stands above the first of these messages that was not read. That is the first unread
 * message when the page holds it. When what is new began before the messages the page holds, it is the first one
 * the page holds: the person then begins where the page begins, with the way to the earlier ones right above,
 * and not at the end with everything counted as read.
 */
export function layOut(
  messages: readonly Message[],
  firstUnread: number | null,
  dayOf: (time: string) => string = localDay
): StreamItem[] {
  return messages.map((message, index) => {
    const before = messages[index - 1];
    const newDay = !before || dayOf(before.createdAt) !== dayOf(message.createdAt);
    const unread = firstUnread !== null && message.number >= firstUnread && (!before || before.number < firstUnread);
    const head =
      newDay ||
      unread ||
      !before ||
      senderOf(before) !== senderOf(message) ||
      Date.parse(message.createdAt) - Date.parse(before.createdAt) > RUN_GAP_MS;
    return { message, newDay, firstUnread: unread, head };
  });
}
