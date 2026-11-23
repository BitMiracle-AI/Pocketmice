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
  /** It is the first one the person had not read when they opened the conversation: a line says so above it */
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
 * Lays out messages, given in the order they were sent. readUpTo is how far the person had read when they opened
 * the conversation (null: they are no member of it, and nothing is marked as unread). dayOf says which day a time
 * is on, for a test to say.
 */
export function layOut(
  messages: readonly Message[],
  readUpTo: number | null,
  dayOf: (time: string) => string = localDay
): StreamItem[] {
  return messages.map((message, index) => {
    const before = messages[index - 1];
    const newDay = !before || dayOf(before.createdAt) !== dayOf(message.createdAt);
    // Only where something read comes before it: a conversation that is all unread needs no line
    const firstUnread = readUpTo !== null && readUpTo > 0 && message.number === readUpTo + 1;
    const head =
      newDay ||
      firstUnread ||
      !before ||
      senderOf(before) !== senderOf(message) ||
      Date.parse(message.createdAt) - Date.parse(before.createdAt) > RUN_GAP_MS;
    return { message, newDay, firstUnread, head };
  });
}
