import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';
import { cursor, limit, nextCursor, PAGED } from '../paging.ts';
import { fileKind } from './file.ts';

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
//
// What is said in a conversation is its messages.
// - A message is text, sent by a member of the conversation. It says who sent it, and through which API key when
//   an agent sent it for them: that is how an agent tells what it said itself from what its person said.
// - The messages of a conversation are numbered from 1 in the order they were sent, with no number left out. A
//   message keeps its number and never changes. Whoever sent it can delete it, and so can the owner of the space:
//   it is then still there under its number, and says nothing.
// - Messages are read by number and not by cursor: getMessages answers with the ones after a number. A number is
//   a place in the conversation that every caller shares and that does not move, which a cursor is not. Whoever
//   is told that a conversation has reached message 12, and has the first 11, asks for what comes after 11.
// - A message can mention members of the conversation: whom it is meant for, where several are in it. And it can
//   point at files and folders of the space, by id. A file it points at may be put in the trash or deleted for good
//   later: the message then still says that it pointed at one, and that the file is not there any more.
// - How far a member has read is one number of their own (lastReadNumber), and only they move it
//   (markConversationRead). Sending a message does not move it: an agent that speaks with the key of a person
//   leaves what that person has read as it was.

/** The title of a conversation has at most this many characters */
export const CONVERSATION_TITLE_MAX_LENGTH = 100;

/** The title of a conversation. Spaces around it are dropped; it is not empty. Two may have the same title */
export const conversationTitle = z.string().trim().min(1).max(CONVERSATION_TITLE_MAX_LENGTH);

/** A message has at most this many characters */
export const MESSAGE_TEXT_MAX_LENGTH = 10_000;

/** What a message says. Spaces and line breaks around it are dropped; it is not empty */
export const messageText = z.string().trim().min(1).max(MESSAGE_TEXT_MAX_LENGTH);

/** A message mentions at most this many members */
export const MESSAGE_MENTIONS_MAX = 20;

/** A message points at most at this many files */
export const MESSAGE_FILES_MAX = 10;

/** A file or a folder a message points at */
const messageFile = z.object({
  id: z.string(),
  /**
   * What it is called, what it is and where it is, now. Null when it is not there any more: it was put in the
   * trash, or deleted for good. One that comes back from the trash is there again
   */
  file: z.object({ name: z.string(), kind: fileKind, path: z.string() }).nullable()
});

/** A message, as whoever can read its conversation sees it */
export const message = z.object({
  /** Its number in the conversation: 1 for the first, and one more for each sent after */
  number: z.number(),
  /** Who sent it, by the name they go by */
  user: z.object({ id: z.string(), name: z.string() }),
  /** The API key it was sent through, when an agent sent it for that person. Null when they sent it themselves */
  apiKey: z.object({ id: z.string(), name: z.string() }).nullable(),
  /** What it says. Empty for a message that was deleted */
  text: z.string(),
  /** The members of the conversation it mentions, by their user id. None for a message that was deleted */
  mentionedUserIds: z.array(z.string()),
  /** The files and folders of the space it points at. None for a message that was deleted */
  files: z.array(messageFile),
  /** When it was deleted: an ISO 8601 time in UTC. Null for one that was not */
  deletedAt: z.iso.datetime().nullable(),
  /** When it was sent: an ISO 8601 time in UTC */
  createdAt: z.iso.datetime()
});

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
  /** Its latest message, the one numbered lastMessageNumber. Null when there is none yet */
  lastMessage: message.nullable(),
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

/**
 * What a message carries, as the descriptions say it: a model that is offered an operation as a tool reads the
 * description, and not the fields of the output.
 */
const A_MESSAGE =
  'A message says who sent it (user), and through which API key when an agent sent it for them (apiKey; null ' +
  'when the person sent it themselves). An agent is no member: it speaks as the person its key belongs to, and ' +
  'tells what it said itself by its own key, whose id getProfile answers with. mentionedUserIds are the members ' +
  'the message is addressed to; a mention of a person is how a message is addressed to them or to their agent. ' +
  'files are the files it points at: each an id and, under file, its name, kind and path as they are now, or ' +
  'null once the file is in the trash or deleted.';

export const createConversation = operation({
  name: 'createConversation',
  description:
    'Starts a conversation in a space: where members of the space talk about one matter, under a title. The ' +
    'caller is its only member to begin with; a person adds the others, signed in themselves. Answers with the ' +
    'conversation. A conversation with the caller alone is where a person and their own agent talk: an agent ' +
    'that has something to tell only its person says it there. The owner of the space can read every ' +
    'conversation in it.',
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
    ' Each comes with its latest message (lastMessage). ' +
    A_MESSAGE +
    ' A conversation whose lastMessageNumber is larger than its lastReadNumber has messages the person has not ' +
    'read. That is about the person, and not about an agent that calls with their key: for such an agent, a ' +
    'conversation whose lastMessage was not sent through its own key is one where something was said since it ' +
    'last spoke.',
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
    'getConversations, each as getConversations answers with it: for the owner of the space, who can read ' +
    'them all; anyone else is answered FORBIDDEN. ' +
    PAGED +
    ' lastReadNumber is null for a conversation the caller is not a member of: the owner reads it, and says ' +
    'nothing in it until they are a member.',
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

export const getMessages = operation({
  name: 'getMessages',
  description:
    'The messages of a conversation after the one numbered afterNumber, in the order they were sent, at most ' +
    'limit of them. Left out, afterNumber is 0: from the first message on. To read on, pass the number of the ' +
    'last message you were given; fewer messages than limit means there are no more for now. To read only the ' +
    "latest, start from the conversation's lastMessageNumber less as many as you want, or from 0 when that is " +
    'below 0: afterNumber is never negative. ' +
    A_MESSAGE +
    ' A message that was deleted is there under its number, with an empty text.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id, afterNumber: z.number().int().min(0).default(0), limit }),
  output: z.object({ messages: z.array(message) }),
  errors: []
});

export const createMessage = operation({
  name: 'createMessage',
  description:
    'Sends a message to a conversation, as the caller. Answers with the message, which has the next number of ' +
    'the conversation. mentionedUserIds names the members of the conversation the message is meant for, by ' +
    'user id; fileIds points at files or folders of the space. Both may be left out. Sent with an API key, the ' +
    'message carries the key, and its readers are shown that an agent sent it for the person: it needs no ' +
    'signature. Sending does not count as reading: what the person has read stays as it was. NOT_FOUND: ' +
    'someone mentioned is not a member of the conversation, or the space has no such file; the message says ' +
    'which.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'member',
  input: z.object({
    spaceId: id,
    conversationId: id,
    text: messageText,
    mentionedUserIds: z.array(id).max(MESSAGE_MENTIONS_MAX).default([]),
    fileIds: z.array(id).max(MESSAGE_FILES_MAX).default([])
  }),
  output: z.object({ message }),
  errors: ['NOT_FOUND']
});

// Whose message it is cannot be told from the definition: it is the one thing an implementation of a conversation
// decides for itself, after reading the message. Everything before that (the space, the role, the conversation) is
// settled as for any other operation.
export const deleteMessage = operation({
  name: 'deleteMessage',
  description:
    'Deletes a message: it stays in the conversation under its number, marked as deleted, and no longer says ' +
    'anything. For whoever sent it, and for the owner of the space; anyone else is answered FORBIDDEN. ' +
    'Deleting one that is deleted already changes nothing. NOT_FOUND: the conversation has no message of that ' +
    'number.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'reader',
  input: z.object({ spaceId: id, conversationId: id, number: z.number().int().min(1) }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});

export const markConversationRead = operation({
  name: 'markConversationRead',
  description:
    'Says how far the person has read a conversation: up to the message of this number. Their lastReadNumber ' +
    'becomes that number, and what is after it is what a page shows them as unread. It only moves forward: a ' +
    'number below it changes nothing, and a number above the latest message counts as the latest. It is for ' +
    'the person to say what they have read: an agent calling with the key of a person who reads the ' +
    'conversation themselves does not call this, or they would never see what was said while they were away. ' +
    'An agent with an account of its own, which nobody else reads as, keeps track of what it has dealt with ' +
    "this way. Nobody else is told, and nobody else's number moves.",
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'conversation',
  minRole: 'viewer',
  openTo: 'member',
  input: z.object({ spaceId: id, conversationId: id, number: z.number().int().min(0) }),
  output: z.object({}),
  errors: []
});
