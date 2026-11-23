import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  addConversationMember,
  createConversation,
  createMessage,
  deleteConversation,
  deleteMessage,
  getConversation,
  getConversations,
  getMessages,
  MESSAGE_TEXT_MAX_LENGTH,
  markConversationRead
} from '@pocketmice/contract/domains/conversation';
import { createFolder, deleteFile, FILE_CONTENT_PATH, restoreFile, trashFile } from '@pocketmice/contract/domains/file';
import { getProfile } from '@pocketmice/contract/domains/profile';
import { createSpace } from '@pocketmice/contract/domains/space';
import { messages } from '@pocketmice/db/schema/conversation';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

/**
 * A space of Ada's with Grace and Linus in it, and a conversation Grace started and added Linus to. Ada, who owns
 * the space, is not in the conversation
 */
async function setting() {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const made = await api.as(ada)(createSpace, { name: 'Research' });
  assert.ok(made.ok);
  const spaceId = made.data.space.id;
  await api.db.insert(spaceMembers).values([
    { spaceId, userId: grace.id, role: 'editor' },
    { spaceId, userId: linus.id, role: 'viewer' }
  ]);
  const started = await api.as(grace)(createConversation, { spaceId, title: 'Launch plan' });
  assert.ok(started.ok);
  const conversationId = started.data.conversation.id;
  const added = await api.as(grace)(addConversationMember, { spaceId, conversationId, userId: linus.id });
  assert.ok(added.ok);
  return { ada, grace, linus, spaceId, conversationId, place: { spaceId, conversationId } };
}

/** Sends a message as this person and returns it */
async function say(person: CurrentUser, place: { spaceId: string; conversationId: string }, text: string) {
  const result = await api.as(person)(createMessage, { ...place, text });
  assert.ok(result.ok, `createMessage should have worked: ${JSON.stringify(result)}`);
  return result.data.message;
}

/** The messages of a conversation as this person reads them: number and text of each, or the error code */
async function read(
  person: CurrentUser,
  place: { spaceId: string; conversationId: string },
  asked: { afterNumber?: number; limit?: number } = {}
) {
  const result = await api.as(person)(getMessages, { ...place, ...asked });
  return result.ok ? result.data.messages.map(({ number, text }) => [number, text]) : result.code;
}

/** The conversation as this person sees it */
async function conversationFor(person: CurrentUser, place: { spaceId: string; conversationId: string }) {
  const result = await api.as(person)(getConversation, place);
  assert.ok(result.ok, `getConversation should have worked: ${JSON.stringify(result)}`);
  return result.data.conversation;
}

test('the messages of a conversation are numbered from 1 in the order they were sent, and each says who sent it', async () => {
  const { grace, linus, place } = await setting();

  const first = await say(grace, place, '  Shall we ship on Friday?\n');
  const second = await say(linus, place, 'Friday works.');

  // The text is kept without the spaces and line breaks around it
  assert.deepEqual(
    { ...first, createdAt: null },
    {
      number: 1,
      user: { id: grace.id, name: 'Grace' },
      apiKey: null,
      text: 'Shall we ship on Friday?',
      mentionedUserIds: [],
      files: [],
      deletedAt: null,
      createdAt: null
    }
  );
  assert.equal(second.number, 2);
  assert.deepEqual(second.user, { id: linus.id, name: 'Linus' });

  const all = await api.as(linus)(getMessages, place);
  assert.deepEqual(all, { ok: true, data: { messages: [first, second] } });

  // The conversation says how far it has come, when, and what was said last
  const conversation = await conversationFor(grace, place);
  assert.equal(conversation.lastMessageNumber, 2);
  assert.equal(conversation.lastMessageAt, second.createdAt);
  assert.deepEqual(conversation.lastMessage, second);
  // And is listed with the same
  const listed = await api.as(grace)(getConversations, { spaceId: place.spaceId });
  assert.ok(listed.ok);
  assert.deepEqual(listed.data.conversations, [conversation]);
});

test('getMessages answers with the messages after a number, at most limit of them: to read on, and to read only the latest', async () => {
  const { grace, place } = await setting();
  for (const text of ['one', 'two', 'three', 'four', 'five']) await say(grace, place, text);

  assert.deepEqual(await read(grace, place, { limit: 2 }), [
    [1, 'one'],
    [2, 'two']
  ]);
  // Reading on from the last one given
  assert.deepEqual(await read(grace, place, { afterNumber: 2, limit: 2 }), [
    [3, 'three'],
    [4, 'four']
  ]);
  // Fewer than limit: there are no more for now
  assert.deepEqual(await read(grace, place, { afterNumber: 4, limit: 2 }), [[5, 'five']]);
  assert.deepEqual(await read(grace, place, { afterNumber: 5 }), []);
  // Only the latest two: from the number the conversation has reached, less two
  const { lastMessageNumber } = await conversationFor(grace, place);
  assert.deepEqual(await read(grace, place, { afterNumber: lastMessageNumber - 2 }), [
    [4, 'four'],
    [5, 'five']
  ]);

  for (const afterNumber of [-1, 1.5]) {
    assert.equal(await read(grace, place, { afterNumber }), 'INVALID_INPUT', String(afterNumber));
  }
});

test('messages sent at the same moment take their numbers one after the other: none twice, none left out', async () => {
  const { grace, linus, place } = await setting();

  const sent = await Promise.all(
    Array.from({ length: 20 }, (_, index) => say(index % 2 === 0 ? grace : linus, place, `message ${index}`))
  );

  assert.deepEqual(
    sent.map(({ number }) => number).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, index) => index + 1)
  );
  const stored = await read(grace, place);
  assert.equal(stored.length, 20);
  assert.equal((await conversationFor(grace, place)).lastMessageNumber, 20);
  // A message with a larger number is not dated before one with a smaller
  const all = await api.as(grace)(getMessages, place);
  assert.ok(all.ok);
  const times = all.data.messages.map(({ createdAt }) => createdAt);
  assert.deepEqual(times, [...times].sort());
});

test('a message is sent by a member of the conversation, whatever their role in the space; it is read by whoever can read the conversation', async () => {
  const { ada, grace, linus, spaceId, place } = await setting();
  const margaret = await api.addPerson('Margaret');
  await api.db.insert(spaceMembers).values({ spaceId, userId: margaret.id, role: 'editor' });

  // Linus only views the files of the space, and talks like anyone
  await say(linus, place, 'Friday works.');

  // The owner of the space reads it without being in it, and says nothing until they are
  assert.deepEqual(await read(ada, place), [[1, 'Friday works.']]);
  const byOwner = await api.as(ada)(createMessage, { ...place, text: 'Not Friday.' });
  assert.equal(byOwner.ok ? 'ok' : byOwner.code, 'FORBIDDEN');

  // For a member of the space who is not in it there is no such conversation
  assert.equal(await read(margaret, place), 'UNKNOWN_CONVERSATION');
  const byStranger = await api.as(margaret)(createMessage, { ...place, text: 'Hello?' });
  assert.equal(byStranger.ok ? 'ok' : byStranger.code, 'UNKNOWN_CONVERSATION');

  assert.deepEqual(await read(grace, place), [[1, 'Friday works.']]);
});

test('a message is not empty and has at most 10000 characters', async () => {
  const { grace, place } = await setting();

  for (const text of ['', ' \n ', 'x'.repeat(MESSAGE_TEXT_MAX_LENGTH + 1)]) {
    const result = await api.as(grace)(createMessage, { ...place, text });
    assert.equal(result.ok ? 'ok' : result.code, 'INVALID_INPUT', `${text.length} characters`);
  }
  assert.equal((await say(grace, place, 'x'.repeat(MESSAGE_TEXT_MAX_LENGTH))).number, 1);
});

test('an agent speaks as its person, and its message says which key it was sent through; getProfile tells the agent which key is its own', async () => {
  const { grace, linus, place } = await setting();
  const made = await api.as(grace)(createApiKey, { name: 'Research agent', permission: 'write' });
  assert.ok(made.ok);
  const agent = api.withKey(made.data.apiKey.key);
  const readOnly = await api.as(grace)(createApiKey, { name: 'Reader', permission: 'read' });
  assert.ok(readOnly.ok);
  const reader = api.withKey(readOnly.data.apiKey.key);

  await say(grace, place, 'Summarise the plan, please.');
  const answered = await agent(createMessage, { ...place, text: 'Ship on Friday, announce on Monday.' });

  assert.ok(answered.ok);
  assert.deepEqual(answered.data.message.user, { id: grace.id, name: 'Grace' });
  assert.deepEqual(answered.data.message.apiKey, { id: made.data.apiKey.id, name: 'Research agent' });

  // The agent finds what it said itself by the id of its key, among what was said under the same name
  const me = await agent(getProfile, {});
  assert.ok(me.ok);
  const all = await agent(getMessages, place);
  assert.ok(all.ok);
  assert.deepEqual(
    all.data.messages.map(({ number, apiKey }) => [number, apiKey?.id === me.data.apiKey?.id]),
    [
      [1, false],
      [2, true]
    ]
  );

  // A read-only key reads what is said and says nothing
  assert.equal((await reader(getMessages, place)).ok, true);
  const refused = [
    await reader(createMessage, { ...place, text: 'Hello.' }),
    await reader(markConversationRead, { ...place, number: 2 }),
    await reader(deleteMessage, { ...place, number: 1 })
  ];
  assert.deepEqual(
    refused.map((result) => (result.ok ? 'ok' : result.code)),
    ['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN']
  );

  // What the agent sent is its person's: she deletes it, and Linus does not
  const byLinus = await api.as(linus)(deleteMessage, { ...place, number: 2 });
  assert.equal(byLinus.ok ? 'ok' : byLinus.code, 'FORBIDDEN');
  assert.equal((await api.as(grace)(deleteMessage, { ...place, number: 2 })).ok, true);
});

test('how far someone has read is their own number: it moves forward only, not past the latest message, and sending does not move it', async () => {
  const { ada, grace, linus, place } = await setting();
  const mark = async (person: CurrentUser, number: number) => {
    const result = await api.as(person)(markConversationRead, { ...place, number });
    assert.ok(result.ok, `markConversationRead should have worked: ${JSON.stringify(result)}`);
    return (await conversationFor(person, place)).lastReadNumber;
  };

  for (const text of ['one', 'two', 'three']) await say(grace, place, text);
  // Whoever sent them has not read them by that: an agent with the key of a person leaves what the person has read
  assert.equal((await conversationFor(grace, place)).lastReadNumber, 0);

  assert.equal(await mark(linus, 2), 2);
  // Not back
  assert.equal(await mark(linus, 1), 2);
  // Not past what was said
  assert.equal(await mark(linus, 99), 3);
  // Nobody else's moved
  assert.equal((await conversationFor(grace, place)).lastReadNumber, 0);

  // The owner of the space, who is not in the conversation, has no number to move
  const byOwner = await api.as(ada)(markConversationRead, { ...place, number: 1 });
  assert.equal(byOwner.ok ? 'ok' : byOwner.code, 'FORBIDDEN');
  assert.equal((await conversationFor(ada, place)).lastReadNumber, null);
});

test('whoever sent a message deletes it, and so does the owner of the space: it stays under its number and says nothing', async () => {
  const { ada, grace, linus, place } = await setting();
  await say(grace, place, 'The password is hunter2.');
  await say(linus, place, 'You may want to delete that.');
  await say(linus, place, 'And this one is for the owner to delete.');

  // Not someone else's
  const byLinus = await api.as(linus)(deleteMessage, { ...place, number: 1 });
  assert.equal(byLinus.ok ? 'ok' : byLinus.code, 'FORBIDDEN');
  assert.deepEqual((await read(linus, place)).at(0), [1, 'The password is hunter2.']);

  assert.deepEqual(await api.as(grace)(deleteMessage, { ...place, number: 1 }), { ok: true, data: {} });
  // The owner of the space, without being in the conversation
  assert.deepEqual(await api.as(ada)(deleteMessage, { ...place, number: 3 }), { ok: true, data: {} });

  const after = await api.as(linus)(getMessages, place);
  assert.ok(after.ok);
  assert.deepEqual(
    after.data.messages.map(({ number, text, deletedAt }) => [number, text, deletedAt !== null]),
    [
      [1, '', true],
      [2, 'You may want to delete that.', false],
      [3, '', true]
    ]
  );
  // Who sent it is still told
  assert.deepEqual(after.data.messages.at(0)?.user, { id: grace.id, name: 'Grace' });
  // The latest message of the conversation is the deleted one, and says nothing there either
  const conversation = await conversationFor(linus, place);
  assert.equal(conversation.lastMessageNumber, 3);
  assert.equal(conversation.lastMessage?.text, '');

  // Deleting it again changes nothing, the time it was deleted at included
  const deletedAt = after.data.messages.at(0)?.deletedAt;
  assert.equal((await api.as(grace)(deleteMessage, { ...place, number: 1 })).ok, true);
  const again = await api.as(linus)(getMessages, place);
  assert.equal(again.ok && again.data.messages.at(0)?.deletedAt, deletedAt);

  const missing = await api.as(grace)(deleteMessage, { ...place, number: 4 });
  assert.equal(missing.ok ? 'ok' : missing.code, 'NOT_FOUND');
});

test('deleting a conversation takes what was said in it', async () => {
  const { ada, grace, place } = await setting();
  await say(grace, place, 'one');
  await say(grace, place, 'two');

  assert.equal((await api.as(ada)(deleteConversation, place)).ok, true);

  assert.deepEqual(await api.db.select().from(messages).where(eq(messages.conversationId, place.conversationId)), []);
});

test('a message mentions members of its conversation, each once; whoever is not in it cannot be mentioned', async () => {
  const { ada, grace, linus, place } = await setting();

  const sent = await api.as(grace)(createMessage, {
    ...place,
    text: '@Linus, can you check the numbers?',
    mentionedUserIds: [linus.id, grace.id, linus.id]
  });
  assert.ok(sent.ok);
  assert.deepEqual(sent.data.message.mentionedUserIds, [linus.id, grace.id]);
  const all = await api.as(linus)(getMessages, place);
  assert.equal(all.ok && all.data.messages.at(0)?.mentionedUserIds.includes(linus.id), true);

  // The owner of the space reads the conversation and is not in it; nobody at all is not either
  for (const userId of [ada.id, NOBODY]) {
    const refused = await api.as(grace)(createMessage, { ...place, text: 'Hello?', mentionedUserIds: [userId] });
    assert.equal(refused.ok ? 'ok' : refused.code, 'NOT_FOUND', userId);
  }
  const tooMany = await api.as(grace)(createMessage, {
    ...place,
    text: 'Everyone!',
    mentionedUserIds: Array.from({ length: 21 }, () => linus.id)
  });
  assert.equal(tooMany.ok ? 'ok' : tooMany.code, 'INVALID_INPUT');
  // Nothing was sent by a message that was refused
  assert.equal((await conversationFor(grace, place)).lastMessageNumber, 1);
});

/** Uploads a small file as this person, and returns its id */
async function upload(person: CurrentUser, spaceId: string, parentId: string, name: string) {
  const body = Buffer.from('Ship on Friday.');
  const response = await api.send(person, `${FILE_CONTENT_PATH}?${new URLSearchParams({ spaceId, parentId, name })}`, {
    method: 'PUT',
    headers: { 'content-length': String(body.length) },
    body
  });
  const answer = (await response.json()) as { file: { id: string } };
  assert.equal(response.status, 200, `the upload should have worked: ${JSON.stringify(answer)}`);
  return answer.file.id;
}

test('a message points at files and folders of the space, and tells each as it is now: gone while it is in the trash, back when it is restored, gone when it is deleted for good', async () => {
  const { ada, grace, linus, spaceId, place } = await setting();
  const folder = await api.as(grace)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  assert.ok(folder.ok);
  const folderId = folder.data.file.id;
  const fileId = await upload(grace, spaceId, folderId, 'plan.md');

  const sent = await api.as(grace)(createMessage, {
    ...place,
    text: 'The plan is here.',
    fileIds: [fileId, folderId, fileId]
  });
  assert.ok(sent.ok);
  const there = [
    { id: fileId, file: { name: 'plan.md', kind: 'file', path: '/Reports/plan.md' } },
    { id: folderId, file: { name: 'Reports', kind: 'folder', path: '/Reports' } }
  ];
  // Each once, in the order they were named
  assert.deepEqual(sent.data.message.files, there);

  /** What the message points at, as Linus reads it: in the conversation, and as the latest message of it */
  const pointedAt = async () => {
    const all = await api.as(linus)(getMessages, place);
    assert.ok(all.ok);
    const { files } = all.data.messages[0] ?? {};
    assert.deepEqual((await conversationFor(linus, place)).lastMessage?.files, files);
    return files;
  };
  assert.deepEqual(await pointedAt(), there);

  // The folder goes into the trash, and what is in it with it
  assert.equal((await api.as(grace)(trashFile, { spaceId, fileId: folderId })).ok, true);
  const gone = [
    { id: fileId, file: null },
    { id: folderId, file: null }
  ];
  assert.deepEqual(await pointedAt(), gone);

  assert.equal((await api.as(grace)(restoreFile, { spaceId, fileId: folderId })).ok, true);
  assert.deepEqual(await pointedAt(), there);

  // The file is deleted for good: the message still points at one, which is not there
  assert.equal((await api.as(grace)(trashFile, { spaceId, fileId })).ok, true);
  assert.equal((await api.as(ada)(deleteFile, { spaceId, fileId })).ok, true);
  assert.deepEqual(await pointedAt(), [{ id: fileId, file: null }, there[1]]);
});

test('a message points only at what is in the space when it is sent: not at a file of another space, one in the trash, or none', async () => {
  const { grace, spaceId, place } = await setting();
  const elsewhere = await api.as(grace)(createSpace, { name: 'Private' });
  assert.ok(elsewhere.ok);
  const foreign = await api.as(grace)(createFolder, {
    spaceId: elsewhere.data.space.id,
    parentId: null,
    name: 'Diary'
  });
  assert.ok(foreign.ok);
  const trashed = await api.as(grace)(createFolder, { spaceId, parentId: null, name: 'Old' });
  assert.ok(trashed.ok);
  assert.equal((await api.as(grace)(trashFile, { spaceId, fileId: trashed.data.file.id })).ok, true);
  const kept = await api.as(grace)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  assert.ok(kept.ok);
  const keptId = kept.data.file.id;
  const notThere: string[] = [foreign.data.file.id, trashed.data.file.id, NOBODY];

  for (const fileId of notThere) {
    // One that is there does not carry one that is not
    const refused = await api.as(grace)(createMessage, { ...place, text: 'Look.', fileIds: [keptId, fileId] });
    assert.equal(refused.ok ? 'ok' : refused.code, 'NOT_FOUND', fileId);
  }
  const tooMany = await api.as(grace)(createMessage, {
    ...place,
    text: 'Look.',
    fileIds: Array.from({ length: 11 }, () => keptId)
  });
  assert.equal(tooMany.ok ? 'ok' : tooMany.code, 'INVALID_INPUT');
  assert.equal((await conversationFor(grace, place)).lastMessageNumber, 0);
});

test('a deleted message no longer says whom it mentioned or what it pointed at', async () => {
  const { grace, linus, spaceId, place } = await setting();
  const folder = await api.as(grace)(createFolder, { spaceId, parentId: null, name: 'Reports' });
  assert.ok(folder.ok);
  await api.as(grace)(createMessage, {
    ...place,
    text: '@Linus, see Reports.',
    mentionedUserIds: [linus.id],
    fileIds: [folder.data.file.id]
  });

  assert.equal((await api.as(grace)(deleteMessage, { ...place, number: 1 })).ok, true);

  const all = await api.as(linus)(getMessages, place);
  assert.ok(all.ok);
  const { text, mentionedUserIds, files } = all.data.messages[0] ?? {};
  assert.deepEqual({ text, mentionedUserIds, files }, { text: '', mentionedUserIds: [], files: [] });
});
