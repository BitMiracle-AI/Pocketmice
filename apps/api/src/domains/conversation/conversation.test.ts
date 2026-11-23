import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  addConversationMember,
  createConversation,
  deleteConversation,
  getAllConversations,
  getConversation,
  getConversations,
  leaveConversation,
  removeConversationMember,
  updateConversation
} from '@pocketmice/contract/domains/conversation';
import { createSpace, deleteSpace, leaveSpace, removeMember } from '@pocketmice/contract/domains/space';
import { conversationMembers, conversations } from '@pocketmice/db/schema/conversation';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser) {
  const result = await api.as(owner)(createSpace, { name: 'Research' });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/**
 * Puts this person into the space in this role, by writing the row. How someone really gets in, with an invite, is
 * tested in domains/invite/invite.test.ts
 */
async function join(spaceId: string, person: CurrentUser, role: 'editor' | 'viewer' = 'editor') {
  await api.db.insert(spaceMembers).values({ spaceId, userId: person.id, role });
}

/** Starts a conversation as this person and returns its id */
async function start(person: CurrentUser, spaceId: string, title = 'Launch plan') {
  const result = await api.as(person)(createConversation, { spaceId, title });
  assert.ok(result.ok, `createConversation should have worked: ${JSON.stringify(result)}`);
  return result.data.conversation.id;
}

/** Adds someone to a conversation, as a person who may */
async function add(by: CurrentUser, spaceId: string, conversationId: string, person: CurrentUser) {
  const result = await api.as(by)(addConversationMember, { spaceId, conversationId, userId: person.id });
  assert.ok(result.ok, `addConversationMember should have worked: ${JSON.stringify(result)}`);
}

/** The titles of the conversations this person is in, as getConversations lists them, or the error code */
async function titlesFor(person: CurrentUser, spaceId: string) {
  const result = await api.as(person)(getConversations, { spaceId });
  return result.ok ? result.data.conversations.map(({ title }) => title) : result.code;
}

/** The ids of the members of a conversation as this person is told, or the error code */
async function membersFor(person: CurrentUser, spaceId: string, conversationId: string) {
  const result = await api.as(person)(getConversation, { spaceId, conversationId });
  return result.ok ? result.data.members.map(({ userId }) => userId) : result.code;
}

/**
 * Says when a conversation was started, by writing the row. Two started one after the other may be of the same
 * millisecond, and are then listed by id: a test that says which comes first says when each was started
 */
async function startedAt(conversationId: string, secondsLater: number) {
  await api.db
    .update(conversations)
    .set({ createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, secondsLater)) })
    .where(eq(conversations.id, conversationId));
}

/** The number of the latest message of a conversation is moved by writing the row: sending is not part of this file */
async function reach(conversationId: string, lastMessageNumber: number, lastMessageAt: Date) {
  await api.db
    .update(conversations)
    .set({ lastMessageNumber, lastMessageAt })
    .where(eq(conversations.id, conversationId));
}

test('whoever starts a conversation is its only member; any member of the space starts one, a viewer too', async () => {
  const ada = await api.addPerson('Ada');
  const linus = await api.addPerson('Linus');
  const spaceId = await makeSpace(ada);
  await join(spaceId, linus, 'viewer');

  const started = await api.as(linus)(createConversation, { spaceId, title: '  Launch plan  ' });

  assert.ok(started.ok);
  const { id, createdAt, ...rest } = started.data.conversation;
  // The title is kept without the spaces around it; nothing was said yet, and nothing is unread
  assert.deepEqual(rest, { title: 'Launch plan', lastMessageNumber: 0, lastMessageAt: null, lastReadNumber: 0 });
  assert.ok(!Number.isNaN(Date.parse(createdAt)));

  const read = await api.as(linus)(getConversation, { spaceId, conversationId: id });
  assert.deepEqual(read, {
    ok: true,
    data: { conversation: started.data.conversation, members: [{ userId: linus.id, name: 'Linus' }] }
  });
});

test('a title is not empty and has at most 100 characters', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);

  for (const title of ['', '   ', 'x'.repeat(101)]) {
    const result = await api.as(ada)(createConversation, { spaceId, title });
    assert.equal(result.ok ? 'ok' : result.code, 'INVALID_INPUT', JSON.stringify(title));
  }
  assert.equal((await api.as(ada)(createConversation, { spaceId, title: 'x'.repeat(100) })).ok, true);
});

test('getConversations lists the conversations the caller is in, the one with the latest message first; one without a message counts by when it was started', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  const first = await start(ada, spaceId, 'First');
  const second = await start(ada, spaceId, 'Second');
  await startedAt(first, 1);
  await startedAt(second, 2);
  await start(grace, spaceId, 'Hers alone');

  // Started later is listed first
  assert.deepEqual(await titlesFor(ada, spaceId), ['Second', 'First']);

  // A message, however old the conversation, brings it to the front
  await reach(first, 3, new Date(Date.now() + 60_000));
  assert.deepEqual(await titlesFor(ada, spaceId), ['First', 'Second']);

  // What the caller has not read is the difference of the two numbers
  const listed = await api.as(ada)(getConversations, { spaceId });
  assert.ok(listed.ok);
  assert.deepEqual(
    listed.data.conversations.map(({ id, lastMessageNumber, lastReadNumber }) => ({
      id,
      lastMessageNumber,
      lastReadNumber
    })),
    [
      { id: first, lastMessageNumber: 3, lastReadNumber: 0 },
      { id: second, lastMessageNumber: 0, lastReadNumber: 0 }
    ]
  );

  // Somebody else in the same space is listed their own
  assert.deepEqual(await titlesFor(grace, spaceId), ['Hers alone']);
});

test('the conversations of a space come a page at a time, each once', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await makeSpace(ada);
  for (const [index, title] of ['A', 'B', 'C', 'D', 'E'].entries()) {
    await startedAt(await start(ada, spaceId, title), index);
  }

  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await api.as(ada)(getConversations, { spaceId, limit: 2, cursor });
    assert.ok(page.ok);
    seen.push(...page.data.conversations.map(({ title }) => title));
    cursor = page.data.nextCursor ?? undefined;
    pages += 1;
  } while (cursor !== undefined);

  assert.deepEqual(seen, ['E', 'D', 'C', 'B', 'A']);
  assert.equal(pages, 3);

  const bad = await api.as(ada)(getConversations, { spaceId, cursor: 'not a cursor' });
  assert.equal(bad.ok ? 'ok' : bad.code, 'INVALID_INPUT');
});

test('a conversation does not exist for a member of the space who is not in it', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  await join(spaceId, linus);
  const conversationId = await start(grace, spaceId);

  assert.equal(await membersFor(linus, spaceId, conversationId), 'UNKNOWN_CONVERSATION');
  const renamed = await api.as(linus)(updateConversation, { spaceId, conversationId, title: 'Mine now' });
  assert.equal(renamed.ok ? 'ok' : renamed.code, 'UNKNOWN_CONVERSATION');
  const joined = await api.as(linus)(addConversationMember, { spaceId, conversationId, userId: linus.id });
  assert.equal(joined.ok ? 'ok' : joined.code, 'UNKNOWN_CONVERSATION');

  // Nor one that is not there, nor one of another space asked for through this one
  assert.equal(await membersFor(grace, spaceId, NOBODY), 'UNKNOWN_CONVERSATION');
  const otherSpace = await makeSpace(grace);
  assert.equal(await membersFor(grace, otherSpace, conversationId), 'UNKNOWN_CONVERSATION');

  // And whoever is not in the space is not told about its conversations at all
  const outsider = await api.addPerson('Margaret');
  assert.equal(await membersFor(outsider, spaceId, conversationId), 'UNKNOWN_SPACE');
  assert.equal(await titlesFor(outsider, spaceId), 'UNKNOWN_SPACE');
});

test('the owner of the space reads every conversation in it without being in any, and comes into one by adding themselves', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  const conversationId = await start(grace, spaceId, 'Between editors');
  await reach(conversationId, 4, new Date());

  // It is not among the owner's own, and is among all
  assert.deepEqual(await titlesFor(ada, spaceId), []);
  const all = await api.as(ada)(getAllConversations, { spaceId });
  assert.ok(all.ok);
  assert.deepEqual(
    all.data.conversations.map(({ title, lastReadNumber }) => ({ title, lastReadNumber })),
    // Not a member of it: nothing says how far the owner has read
    [{ title: 'Between editors', lastReadNumber: null }]
  );
  assert.deepEqual(await membersFor(ada, spaceId, conversationId), [grace.id]);

  // Every conversation is for the owner alone to ask for
  const asked = await api.as(grace)(getAllConversations, { spaceId });
  assert.equal(asked.ok ? 'ok' : asked.code, 'FORBIDDEN');

  // What is open to members is not open to the owner until they are one
  const left = await api.as(ada)(leaveConversation, { spaceId, conversationId });
  assert.equal(left.ok ? 'ok' : left.code, 'FORBIDDEN');

  await add(ada, spaceId, conversationId, ada);
  assert.deepEqual(await membersFor(ada, spaceId, conversationId), [grace.id, ada.id]);
  assert.deepEqual(await titlesFor(ada, spaceId), ['Between editors']);
  // What was said before they came is theirs to read, and does not count as unread
  const mine = await api.as(ada)(getConversation, { spaceId, conversationId });
  assert.ok(mine.ok);
  assert.equal(mine.data.conversation.lastReadNumber, 4);
});

test('a member adds members of the space to a conversation; adding someone who is in it changes nothing', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const outsider = await api.addPerson('Margaret');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  await join(spaceId, linus, 'viewer');
  const conversationId = await start(grace, spaceId);

  await add(grace, spaceId, conversationId, linus);
  await api.db.update(conversationMembers).set({ lastReadNumber: 7 }).where(eq(conversationMembers.userId, linus.id));
  // A second time changes nothing: Linus keeps his row, with how far he has read
  await add(grace, spaceId, conversationId, linus);
  assert.deepEqual(await membersFor(linus, spaceId, conversationId), [grace.id, linus.id]);
  const read = await api.as(linus)(getConversation, { spaceId, conversationId });
  assert.ok(read.ok);
  assert.equal(read.data.conversation.lastReadNumber, 7);

  // Only a member of the space can be added
  for (const userId of [outsider.id, NOBODY]) {
    const result = await api.as(grace)(addConversationMember, { spaceId, conversationId, userId });
    assert.equal(result.ok ? 'ok' : result.code, 'NOT_FOUND');
  }
  assert.deepEqual(await membersFor(grace, spaceId, conversationId), [grace.id, linus.id]);
});

test('a member leaves a conversation by themselves; taking someone else out is for the owner of the space', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  await join(spaceId, linus);
  const conversationId = await start(grace, spaceId);
  await add(grace, spaceId, conversationId, linus);

  const byMember = await api.as(grace)(removeConversationMember, { spaceId, conversationId, userId: linus.id });
  assert.equal(byMember.ok ? 'ok' : byMember.code, 'FORBIDDEN');

  assert.deepEqual(await api.as(ada)(removeConversationMember, { spaceId, conversationId, userId: linus.id }), {
    ok: true,
    data: {}
  });
  assert.equal(await membersFor(linus, spaceId, conversationId), 'UNKNOWN_CONVERSATION');
  const again = await api.as(ada)(removeConversationMember, { spaceId, conversationId, userId: linus.id });
  assert.equal(again.ok ? 'ok' : again.code, 'NOT_FOUND');

  // The last member leaves: the conversation stays, for the owner to read, to add someone to or to delete
  assert.deepEqual(await api.as(grace)(leaveConversation, { spaceId, conversationId }), { ok: true, data: {} });
  assert.equal(await membersFor(grace, spaceId, conversationId), 'UNKNOWN_CONVERSATION');
  assert.deepEqual(await membersFor(ada, spaceId, conversationId), []);
  await add(ada, spaceId, conversationId, grace);
  assert.deepEqual(await membersFor(grace, spaceId, conversationId), [grace.id]);
});

test('whoever can read a conversation changes its title', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace, 'viewer');
  const conversationId = await start(grace, spaceId, 'Launch plan');

  const byMember = await api.as(grace)(updateConversation, { spaceId, conversationId, title: ' Launch, take two ' });
  assert.ok(byMember.ok);
  assert.equal(byMember.data.conversation.title, 'Launch, take two');

  const byOwner = await api.as(ada)(updateConversation, { spaceId, conversationId, title: 'Launch' });
  assert.ok(byOwner.ok);
  assert.deepEqual(await titlesFor(grace, spaceId), ['Launch']);
});

test('only the owner of the space deletes a conversation, and it is gone for everyone', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  const conversationId = await start(grace, spaceId);

  // Not even whoever started it
  const byStarter = await api.as(grace)(deleteConversation, { spaceId, conversationId });
  assert.equal(byStarter.ok ? 'ok' : byStarter.code, 'FORBIDDEN');

  assert.deepEqual(await api.as(ada)(deleteConversation, { spaceId, conversationId }), { ok: true, data: {} });
  assert.equal(await membersFor(grace, spaceId, conversationId), 'UNKNOWN_CONVERSATION');
  assert.equal(await membersFor(ada, spaceId, conversationId), 'UNKNOWN_CONVERSATION');
  assert.deepEqual(
    await api.db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId)),
    []
  );
});

test('an agent is in the conversations of its person: it starts, reads and renames with their key, and decides nothing about who is in one', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  const keyOf = async (permission: 'read' | 'write') => {
    const made = await api.as(grace)(createApiKey, { name: 'Research agent', permission });
    assert.ok(made.ok);
    return api.withKey(made.data.apiKey.key);
  };
  const reader = await keyOf('read');
  const writer = await keyOf('write');

  const started = await writer(createConversation, { spaceId, title: 'Weekly report' });
  assert.ok(started.ok);
  const conversationId = started.data.conversation.id;
  // What the agent started is its person's: she is the member
  assert.deepEqual(await membersFor(grace, spaceId, conversationId), [grace.id]);

  assert.equal((await reader(getConversations, { spaceId })).ok, true);
  assert.equal((await reader(getConversation, { spaceId, conversationId })).ok, true);
  assert.equal((await writer(updateConversation, { spaceId, conversationId, title: 'Report' })).ok, true);

  const refused = [
    await reader(createConversation, { spaceId, title: 'Another' }),
    await reader(updateConversation, { spaceId, conversationId, title: 'Another' }),
    // Who is in a conversation is for a person who signed in, whatever the key may do
    await writer(addConversationMember, { spaceId, conversationId, userId: ada.id }),
    await writer(leaveConversation, { spaceId, conversationId }),
    await writer(removeConversationMember, { spaceId, conversationId, userId: grace.id }),
    await writer(deleteConversation, { spaceId, conversationId })
  ];
  assert.deepEqual(
    refused.map((result) => (result.ok ? 'ok' : result.code)),
    ['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN']
  );
  assert.deepEqual(await membersFor(grace, spaceId, conversationId), [grace.id]);
});

test('whoever stops being a member of the space is out of its conversations, and joining again brings them back into none', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  await join(spaceId, linus);
  const conversationId = await start(ada, spaceId);
  await add(ada, spaceId, conversationId, grace);
  await add(ada, spaceId, conversationId, linus);

  // One is removed by the owner, the other leaves
  assert.equal((await api.as(ada)(removeMember, { spaceId, userId: grace.id })).ok, true);
  assert.equal((await api.as(linus)(leaveSpace, { spaceId })).ok, true);
  assert.deepEqual(await membersFor(ada, spaceId, conversationId), [ada.id]);

  await join(spaceId, grace);
  assert.deepEqual(await titlesFor(grace, spaceId), []);
  assert.equal(await membersFor(grace, spaceId, conversationId), 'UNKNOWN_CONVERSATION');
});

test('the database refuses a member of a conversation who is not a member of its space, whatever the code that writes the row does', async () => {
  const ada = await api.addPerson('Ada');
  const outsider = await api.addPerson('Margaret');
  const spaceId = await makeSpace(ada);
  const otherSpace = await makeSpace(outsider);
  const conversationId = await start(ada, spaceId);

  // Not in the space of the conversation
  await assert.rejects(async () => {
    await api.db.insert(conversationMembers).values({ conversationId, userId: outsider.id, spaceId });
  });
  // In a space, and the conversation is of another
  await assert.rejects(async () => {
    await api.db.insert(conversationMembers).values({ conversationId, userId: outsider.id, spaceId: otherSpace });
  });
});

test('deleting a space takes its conversations with it', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await join(spaceId, grace);
  const kept = await start(ada, await makeSpace(ada), 'In another space');
  const conversationId = await start(grace, spaceId);
  await add(grace, spaceId, conversationId, ada);

  assert.deepEqual(await api.as(ada)(deleteSpace, { spaceId }), { ok: true, data: {} });

  assert.deepEqual(
    (await api.db.select({ id: conversations.id }).from(conversations)).map(({ id }) => id).includes(conversationId),
    false
  );
  assert.deepEqual(await api.db.select().from(conversationMembers).where(eq(conversationMembers.spaceId, spaceId)), []);
  assert.equal((await api.db.select().from(conversations).where(eq(conversations.id, kept))).length, 1);
});
