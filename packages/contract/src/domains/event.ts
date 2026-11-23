import { z } from 'zod';
import { id } from '../id.ts';

// Events: how a caller hears that something in a space changed, the moment it does, without asking over and over.
// It is not an operation: the answer to one request is not a value, it is a line for each thing that happens,
// written for as long as the channel stays open.
//
// The rules of a channel:
// - GET EVENTS_PATH with the space in the query (eventsQuery). Who may open one is checked the way it is for an
//   operation, and a refusal is the same error body: any member of the space, signed in or calling with an API
//   key, a read-only one too.
// - An event says that something changed, and never what it changed to. Whoever hears one reads what changed
//   through the operations, where who may read what is decided, as it always is. So nothing is told on a channel
//   that its caller could not have asked for, and an event that is lost costs nothing that reading again does not
//   bring back.
// - A channel begins with the event open. From that moment on nothing that happens is missed, and nothing before
//   it is told: whoever listens reads what they hold once more when they hear it, on the first channel and on every
//   one after. That is all it takes to have missed nothing, however long a caller was away.
// - A caller is told about a conversation when they can read it: its members, and the owner of the space.
// - What is told is what happens to a conversation. Someone who stops being a member of the space is out of its
//   conversations with that, and of this nobody is told: the others find them gone from a conversation the next
//   time they read it.
// - The server writes a ping every EVENTS_PING_MS. A caller that has received no byte for EVENTS_SILENCE_MS takes
//   the channel for broken and opens another: a laptop that sleeps and a network that drops tell nobody.
// - A channel does not stay open for long: the server ends it after a few minutes, and the caller opens the next
//   at once. Who the caller is, and that they are still a member, is checked again each time, so someone taken out
//   of a space hears nothing more of it from then at the latest.
// - An event of a type the caller does not know is passed over: the server may be newer than the caller.
//
// How it is written: the answer is text/event-stream, and each event is one line, `data: <JSON>`, followed by an
// empty line.

/** The address of the channel: what comes after the host */
export const EVENTS_PATH = '/api/events';

/** What the query of a channel says: which space */
export const eventsQuery = z.strictObject({ spaceId: id });

export type EventsQuery = z.input<typeof eventsQuery>;

/** The address of a channel with its query, as it comes after the host */
export function eventsPath(query: EventsQuery): string {
  return `${EVENTS_PATH}?${new URLSearchParams(query)}`;
}

/** How often the server writes a ping, in milliseconds */
export const EVENTS_PING_MS = 3000;

/** How long a caller receives no byte before it takes the channel for broken, in milliseconds */
export const EVENTS_SILENCE_MS = 10_000;

/** What is told on a channel, pings left out */
export const spaceEvent = z.discriminatedUnion('type', [
  /** The channel is open: nothing is missed from here on. Read what you hold once more */
  z.object({ type: z.literal('open') }),
  /**
   * A message was sent to a conversation, which has now reached this number. getMessages with the number of the
   * last message you have answers with what you are missing
   */
  z.object({ type: z.literal('message'), conversationId: z.string(), number: z.number() }),
  /**
   * Something else about a conversation changed: its title, who is in it, a message of it was deleted; or the
   * conversation is new to you, or gone for you. getConversation answers with it as it is, or says that it is not
   * there for you any more
   */
  z.object({ type: z.literal('conversation'), conversationId: z.string() })
]);

export type SpaceEvent = z.infer<typeof spaceEvent>;
