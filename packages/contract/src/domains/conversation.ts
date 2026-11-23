import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';
import { cursor, limit, nextCursor, PAGED } from '../paging.ts';

// Conversations: where the members of a space talk, people and the agents that act for them alike.
// - A conversation is about one matter: it has a title, and members of its own. The same people can have any
//   number of conversations, and one with two members is the same thing as one with twenty.
// - It is in one space, and its members are members of that space. Whoever stops being a member of the space is
//   out of its conversations with that, and joining the space again brings them back into none.
// - Who can read a conversation: its members, and the owner of the space, who reads every conversation in it
//   without being a member of any. So no conversation is closed to the owner, and a page says so where one is
//   started.
// - Any member of the space starts one, a viewer too: the roles of a space say what someone may do to its files,
//   and talking changes no file. Whoever starts a conversation is its only member to begin with.
// - A member of a conversation adds members to it, and so does the owner of the space; that is also how the owner
//   comes into one. A member leaves by themselves. Only the owner takes someone else out, and only the owner
//   deletes a conversation. These four decide who reads what was said, or cannot be undone: they are for a person
//   who signed in, and no API key does them.
// - An agent is no member of anything: it calls with the API key of a person, and is in the conversations that
//   person is in.
// - A conversation that every member has left stays, for the owner of the space to read, to add someone to, or to
//   delete.

/** The title of a conversation has at most this many characters */
export const CONVERSATION_TITLE_MAX_LENGTH = 100;

/** The title of a conversation. Spaces around it are dropped; it is not empty. Two may have the same title */
export const conversationTitle = z.string().trim().min(1).max(CONVERSATION_TITLE_MAX_LENGTH);

/** A conversation, as someone who can read it sees it */
export const conversation = z.object({
  id: z.string(),
  title: z.string(),
  /**
   * The number of its latest message. The messages of a conversation are numbered from 1, in the order they were
   * sent. 0 when there is none yet
   */
  lastMessageNumber: z.number(),
  /** When its latest message was sent: an ISO 8601 time in UTC. Null when there is none yet */
  lastMessageAt: z.iso.datetime().nullable(),
  /**
   * The number of the latest message the caller has read; 0 when they have read none. Null when the caller is not
   * a member of the conversation: the owner of the space, reading one they are not in
   */
  lastReadNumber: z.number().nullable(),
  /** When it was started: an ISO 8601 time in UTC */
  createdAt: z.iso.datetime()
});

/** A member of a conversation, as whoever can read it sees them */
const conversationMember = z.object({
  userId: z.string(),
  /** The name they go by */
  name: z.string()
});

export const createConversation = operation({
  name: 'createConversation',
  description:
    'Starts a conversation in a space: where members of the space talk about one matter, under a title. The ' +
    'caller is its only member to begin with; a person adds the others, signed in themselves. Answers with the ' +
    'conversation. The owner of the space can read every conversation in it.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, title: conversationTitle }),
  output: z.object({ conversation }),
  errors: []
});

export const getConversations = operation({
  name: 'getConversations',
  description:
    'The conversations of a space that the caller is a member of, the one with the latest message first; one ' +
    'without a message counts by when it was started. ' +
    PAGED +
    ' A conversation whose lastMessageNumber is larger than its lastReadNumber has messages the caller has not ' +
    'read.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'viewer',
  input: z.object({ spaceId: id, limit, cursor }),
  output: z.object({ conversations: z.array(conversation), nextCursor }),
  errors: []
});

// Two operations and not one with a switch: who may ask for every conversation is settled by the role the
// definition states, like everything else, and not by an implementation that looks at what was asked for.
export const getAllConversations = operation({
  name: 'getAllConversations',
  description:
    'Every conversation of a space, whether the caller is a member of it or not, in the order of ' +
    'getConversations: for the owner of the space, who can read them all. ' +
    PAGED +
    ' lastReadNumber is null for a conversation the caller is not a member of.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'space',
  minRole: 'owner',
  input: z.object({ spaceId: id, limit, cursor }),
  output: z.object({ conversations: z.array(conversation), nextCursor }),
  errors: []
});

export const getConversation = operation({
  name: 'getConversation',
  description: 'One conversation, and its members in the order they came into it, each by the name they go by.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id }),
  output: z.object({ conversation, members: z.array(conversationMember) }),
  errors: []
});

export const updateConversation = operation({
  name: 'updateConversation',
  description: 'Changes the title of a conversation. Answers with the conversation as it is after the change.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id, title: conversationTitle }),
  output: z.object({ conversation }),
  errors: []
});

export const addConversationMember = operation({
  name: 'addConversationMember',
  description:
    'Makes a member of the space a member of a conversation. They can read all that was said in it before; ' +
    'what counts as unread for them begins now. Adding someone who is in it already changes nothing. The owner ' +
    'of the space comes into a conversation by adding themselves. NOT_FOUND: the space has no such member.',
  kind: 'write',
  access: 'session',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id, userId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});

export const leaveConversation = operation({
  name: 'leaveConversation',
  description:
    'The caller stops being a member of a conversation. The conversation and what was said in it stay, also ' +
    'when nobody is left in it: the owner of the space still reads it.',
  kind: 'write',
  access: 'session',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'member',
  input: z.object({ spaceId: id, conversationId: id }),
  output: z.object({}),
  errors: []
});

export const removeConversationMember = operation({
  name: 'removeConversationMember',
  description: 'Takes a member out of a conversation. NOT_FOUND: the conversation has no such member.',
  kind: 'write',
  access: 'session',
  belongsTo: 'conversation',
  minRole: 'owner',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id, userId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});

export const deleteConversation = operation({
  name: 'deleteConversation',
  description:
    'Deletes a conversation for good, with everything that was said in it. Nothing brings it back, so it is ' +
    'for the owner of the space, signed in themselves.',
  kind: 'write',
  access: 'session',
  belongsTo: 'conversation',
  minRole: 'owner',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id }),
  output: z.object({}),
  errors: []
});
