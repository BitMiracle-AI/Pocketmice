import {
  addConversationMember,
  conversationTitle,
  createConversation,
  createMessage,
  deleteConversation,
  deleteMessage,
  getAllConversations,
  getConversation,
  getConversations,
  getMessages,
  leaveConversation,
  markConversationRead,
  removeConversationMember,
  updateConversation
} from '@pocketmice/contract/domains/conversation';
import { id } from '@pocketmice/contract/id';
import type { OutputOf } from '@pocketmice/contract/operation';
import { PAGE_SIZE_MAX } from '@pocketmice/contract/paging';
import { queryOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiFailure, call, failureText, queryClient, readPages, readQuery } from '@/lib/api';
import { unreadCount, windowStart } from './messageLayout';
import { conversationText } from './text';

// The conversations of a space: where its members talk, people and the agents that act for them alike. What a
// conversation is and who may do what in one is said in the contract (domains/conversation.ts); this is how the
// pages read them and change them.
// - Everything is read through the cache, under the name of its operation and the space, like everything else of
//   a space. What a write changed is marked stale here; what somebody else changed is heard as an event
//   (features/event), which marks the same reads stale.
// - The messages of a conversation are read by number: a page holds the ones after a number (its window), all of
//   them, and asks for the same window again when it hears that something changed.

/** A conversation, as someone who can read it sees it */
export type Conversation = OutputOf<typeof getConversation>['conversation'];

/** A member of a conversation */
export type ConversationMember = OutputOf<typeof getConversation>['members'][number];

/** A message of a conversation */
export type Message = OutputOf<typeof getMessages>['messages'][number];

/** The conversations of a space the person is a member of, the one with the latest message first, a page at a time */
export function conversationsQuery(spaceId: string) {
  return readPages(getConversations, { spaceId });
}

/**
 * How many messages of the conversations of a space the person has not read: what the sidebar says next to the
 * way to the conversations, on every page of the space. It counts the conversations read so far, the first page
 * of them when nothing else has asked for more: the ones with something new are the first of the list.
 */
export function useUnreadTotal(spaceId: string): number {
  const { data } = useInfiniteQuery(conversationsQuery(spaceId));
  return (data?.pages ?? []).flatMap((page) => page.conversations).reduce((sum, each) => sum + unreadCount(each), 0);
}

/** Every conversation of a space, in the same order: for its owner, who reads them all */
export function allConversationsQuery(spaceId: string) {
  return readPages(getAllConversations, { spaceId });
}

/** One conversation and its members */
export function conversationQuery(spaceId: string, conversationId: string) {
  return readQuery(getConversation, { spaceId, conversationId });
}

/**
 * The messages of a conversation after the one numbered afterNumber, all of them, in the order they were sent.
 * The api gives at most so many at a time; they are read until there are no more.
 */
export function messagesQuery(spaceId: string, conversationId: string, afterNumber: number) {
  return queryOptions<Message[], ApiFailure>({
    queryKey: [getMessages.name, { spaceId, conversationId, afterNumber }, 'whole'],
    queryFn: async () => {
      const messages: Message[] = [];
      for (;;) {
        const page = await call(getMessages, {
          spaceId,
          conversationId,
          // The numbers of a conversation leave none out: after so many messages comes the next
          afterNumber: afterNumber + messages.length,
          limit: PAGE_SIZE_MAX
        });
        if (!page.ok) throw new ApiFailure(page.code, page.message);
        messages.push(...page.data.messages);
        if (page.data.messages.length < PAGE_SIZE_MAX) return messages;
      }
    }
  });
}

/** How far the opening of a conversation has come, for the page that shows it */
export interface Opening {
  /** The conversation and its members, from the moment the page may show them, and null until then */
  shown: { conversation: Conversation; members: readonly ConversationMember[] } | null;
  /** The person can read no such conversation */
  gone: boolean;
  /** What the opening waits for was asked and not answered: what went wrong, and how it is asked again */
  failed: { error: unknown; retry: () => void } | null;
}

/**
 * Opens the conversation conversationId of a space for its page: reads the conversation, and then the messages
 * the page opens with.
 * The page is there at once, and says that it waits. It shows the conversation from the moment both answers are
 * what is true now, and not before: as it opens it decides, from what it is handed then, where what the person has
 * not read begins and where the page stands. So what the cache holds is used while it is fresh, and waited for
 * when it was marked stale or is old: a conversation shown a moment ago opens at once, and one in which something
 * happened since opens when the api has said what.
 * Once open it stays open: what is read again while the person looks on is handed on as it comes.
 * conversationId is the one in the address, which anyone can write: what is no id, and an id the person can read
 * no conversation for, is gone.
 */
export function useOpening(spaceId: string, conversationId: string): Opening {
  const valid = id.safeParse(conversationId).success;
  const found = useQuery({ ...conversationQuery(spaceId, conversationId), enabled: valid });
  // Which conversation was opened. The page stays while the address goes from one conversation to another, and
  // the next one is opened anew
  const [openedId, setOpenedId] = useState<string | null>(null);
  const wasOpen = openedId === conversationId;
  const told = found.data !== undefined && !found.isStale;
  // Where the messages begin is known once the conversation has said where it ends now. The page reads them
  // itself from then on (the same answer, under the same name)
  const first = useQuery({
    ...messagesQuery(spaceId, conversationId, windowStart(found.data?.conversation.lastMessageNumber ?? 0)),
    enabled: told && !wasOpen
  });
  const open = wasOpen || (told && first.data !== undefined && !first.isStale);
  if (open && !wasOpen) setOpenedId(conversationId);

  // A read that failed with an earlier answer in hand keeps that answer and stays failed while it is asked again
  const failing = open ? [] : [found, first].filter((read) => read.isError && !read.isFetching);
  const failure = failing[0];
  const unknown = (code: string | undefined) => code === 'UNKNOWN_CONVERSATION';
  return {
    shown: open && found.data !== undefined ? found.data : null,
    gone: !valid || unknown(found.error?.code) || (!open && unknown(first.error?.code)),
    failed: failure
      ? {
          error: failure.error,
          retry: () => {
            for (const read of failing) void read.refetch();
          }
        }
      : null
  };
}

/** The reads that list conversations */
const LISTS: readonly string[] = [getConversations.name, getAllConversations.name];

/** The reads that say what one conversation is and who has read how far */
const ABOUT: readonly string[] = [...LISTS, getConversation.name];

/** Every read that says something about conversations */
const EVERYTHING: readonly string[] = [...ABOUT, getMessages.name];

/** Marks as stale what was read by the operations named, of one conversation of a space or of all of them */
function markStale(names: readonly string[], spaceId: string, conversationId?: string): void {
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) => {
      const [name, input] = queryKey as [unknown, { spaceId?: unknown; conversationId?: unknown } | undefined];
      if (typeof name !== 'string' || !names.includes(name) || input?.spaceId !== spaceId) return false;
      // A list of conversations is asked for without one: every conversation is in it
      return (
        conversationId === undefined || input.conversationId === undefined || input.conversationId === conversationId
      );
    }
  });
}

/**
 * Something changed about a conversation of a space, or, with no conversation named, about any of them: what was
 * read about it is marked stale, and what a page is showing is asked for again. A write says so here, and so does
 * an event that was heard.
 */
export function conversationsChanged(spaceId: string, conversationId?: string): void {
  markStale(EVERYTHING, spaceId, conversationId);
}

/**
 * Starts a conversation called title, and adds the members named to it. Answers with the conversation; or with
 * the sentence that says why it was not started. missed says that someone could not be added: the conversation is
 * there, and its page adds them.
 */
export async function startConversation(
  spaceId: string,
  title: string,
  userIds: readonly string[]
): Promise<{ conversation: Conversation; missed: boolean } | { problem: string }> {
  const checked = conversationTitle.safeParse(title);
  if (!checked.success) return { problem: conversationText.titleMissing };

  const result = await call(createConversation, { spaceId, title: checked.data });
  if (!result.ok) return { problem: failureText(result.code, {}) };

  const { conversation } = result.data;
  let missed = false;
  for (const userId of userIds) {
    const added = await call(addConversationMember, { spaceId, conversationId: conversation.id, userId });
    if (!added.ok) missed = true;
  }
  conversationsChanged(spaceId, conversation.id);
  return { conversation, missed };
}

/** Gives a conversation another title. Null when it has it, or the sentence that says why it has not */
export async function renameConversation(
  spaceId: string,
  conversationId: string,
  title: string
): Promise<string | null> {
  const checked = conversationTitle.safeParse(title);
  if (!checked.success) return conversationText.titleMissing;

  const result = await call(updateConversation, { spaceId, conversationId, title: checked.data });
  conversationsChanged(spaceId, conversationId);
  return result.ok ? null : failureText(result.code, {});
}

/** Makes a member of the space a member of a conversation. Null when they are, or the sentence that says why not */
export async function addToConversation(
  spaceId: string,
  conversationId: string,
  userId: string
): Promise<string | null> {
  const result = await call(addConversationMember, { spaceId, conversationId, userId });
  conversationsChanged(spaceId, conversationId);
  return result.ok ? null : failureText(result.code, { NOT_FOUND: conversationText.notInSpace });
}

/**
 * Takes a member out of a conversation. Null when they are out, or the sentence that says why they are not.
 * Someone who turns out to be out already is out, which is what was asked for.
 */
export async function removeFromConversation(
  spaceId: string,
  conversationId: string,
  userId: string
): Promise<string | null> {
  const result = await call(removeConversationMember, { spaceId, conversationId, userId });
  conversationsChanged(spaceId, conversationId);
  if (result.ok || result.code === 'NOT_FOUND') return null;
  return failureText(result.code, {});
}

/**
 * The person leaves a conversation. Null when they are out of it, or the sentence that says why they are not.
 * A conversation that turns out to be gone for them already is left too.
 * What was read about it is not marked stale here: the page that asked is the page of that conversation, and
 * goes elsewhere first (conversationsChanged).
 */
export async function exitConversation(spaceId: string, conversationId: string): Promise<string | null> {
  const result = await call(leaveConversation, { spaceId, conversationId });
  if (result.ok || result.code === 'UNKNOWN_CONVERSATION') return null;
  return failureText(result.code, {});
}

/**
 * Deletes a conversation for good. Null when it is gone, or the sentence that says why it is not. One that turns
 * out to be gone already is gone, which is what was asked for. As with leaving, the page goes elsewhere first.
 */
export async function removeConversation(spaceId: string, conversationId: string): Promise<string | null> {
  const result = await call(deleteConversation, { spaceId, conversationId });
  if (result.ok || result.code === 'UNKNOWN_CONVERSATION') return null;
  return failureText(result.code, {});
}

/** What a message says, whom it mentions and which files it points at */
export interface Draft {
  text: string;
  mentionedUserIds: string[];
  fileIds: string[];
}

/**
 * Sends a message to a conversation. Null when it is sent, or the sentence that says why it is not: what was
 * written stays with whoever wrote it.
 * The message the api answers with is put after the messages the cache holds when it is the next one, so the page
 * shows it without asking; what was read about the conversation is marked stale either way.
 */
export async function sendMessage(spaceId: string, conversationId: string, draft: Draft): Promise<string | null> {
  const result = await call(createMessage, { spaceId, conversationId, ...draft });
  if (result.ok) {
    const { message } = result.data;
    const windows = queryClient.getQueriesData<Message[]>({
      predicate: ({ queryKey }) => {
        const input = queryKey[1] as { spaceId?: unknown; conversationId?: unknown } | undefined;
        return (
          queryKey[0] === getMessages.name && input?.spaceId === spaceId && input.conversationId === conversationId
        );
      }
    });
    for (const [queryKey, held] of windows) {
      const { afterNumber } = queryKey[1] as { afterNumber: number };
      // A window holds every message after the number it begins at: so many of them end one before this one
      if (held && afterNumber + held.length === message.number - 1) {
        queryClient.setQueryData(queryKey, [...held, message]);
      }
    }
  }
  conversationsChanged(spaceId, conversationId);
  return result.ok ? null : failureText(result.code, { NOT_FOUND: conversationText.mentionOrFileGone });
}

/** Deletes a message. Null when it is deleted, or the sentence that says why it is not */
export async function removeMessage(spaceId: string, conversationId: string, number: number): Promise<string | null> {
  const result = await call(deleteMessage, { spaceId, conversationId, number });
  conversationsChanged(spaceId, conversationId);
  return result.ok ? null : failureText(result.code, { NOT_FOUND: conversationText.messageGone });
}

/**
 * Says that the person has read a conversation up to the message of this number. Nothing is said when it fails,
 * and it is not tried again for that number: the page says how far they have read when the next message is shown,
 * or when the conversation is opened again.
 * How far they have read is in what was read about the conversation, and not in its messages: only that is
 * marked stale.
 */
export async function markRead(spaceId: string, conversationId: string, number: number): Promise<void> {
  const result = await call(markConversationRead, { spaceId, conversationId, number });
  if (result.ok) markStale(ABOUT, spaceId, conversationId);
}
