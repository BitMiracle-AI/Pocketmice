import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiKey } from '@pocketmice/contract/domains/apiKey';
import {
  addConversationMember,
  createConversation,
  createMessage,
  deleteConversation,
  deleteMessage,
  leaveConversation,
  removeConversationMember,
  updateConversation
} from '@pocketmice/contract/domains/conversation';
import { eventsPath, type SpaceEvent } from '@pocketmice/contract/domains/event';
import { createSpace } from '@pocketmice/contract/domains/space';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { createApp } from '../../app.ts';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

/** A channel a test listens on */
interface Listening {
  /** The next event that is not a ping. Fails when none comes in two seconds */
  next: () => Promise<SpaceEvent>;
  /** The events that have come and that next has not handed out, after a moment for stragglers */
  waiting: () => Promise<SpaceEvent[]>;
  /** Resolves when the server has ended the channel */
  ended: Promise<void>;
  /** How many pings came */
  pings: () => number;
  close: () => Promise<void>;
}

const open: Listening[] = [];

/** Reads the events of an answer that is a channel */
function read(response: Response): Listening {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  if (!response.body) throw new Error('The channel has no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const queued: SpaceEvent[] = [];
  let pings = 0;
  let wake = () => {};

  const ended = (async () => {
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      text += decoder.decode(value, { stream: true });
      for (let end = text.indexOf('\n\n'); end >= 0; end = text.indexOf('\n\n')) {
        const line = text.slice(0, end);
        text = text.slice(end + 2);
        assert.ok(line.startsWith('data: '), `an event is a line that begins with "data: ", got ${line}`);
        const event = JSON.parse(line.slice('data: '.length)) as SpaceEvent | { type: 'ping' };
        if (event.type === 'ping') pings += 1;
        else queued.push(event);
        wake();
      }
    }
  })();

  const listening: Listening = {
    next: async () => {
      const deadline = Date.now() + 2000;
      while (queued.length === 0) {
        const left = deadline - Date.now();
        assert.ok(left > 0, 'no event came in two seconds');
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, left);
        });
      }
      return queued.shift() as SpaceEvent;
    },
    waiting: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return queued.splice(0);
    },
    ended,
    pings: () => pings,
    close: () => reader.cancel()
  };
  open.push(listening);
  return listening;
}

/** Opens a channel of a space as this person, or with this key, and takes the open it begins with */
async function listen(who: CurrentUser | { key: string }, spaceId: string): Promise<Listening> {
  const listening = read(await api.send(who, eventsPath({ spaceId })));
  assert.deepEqual(await listening.next(), { type: 'open' });
  return listening;
}

test.afterEach(async () => {
  for (const listening of open.splice(0)) await listening.close();
});

/**
 * A space of Ada's with Grace, Linus and Margaret in it, and a conversation of Grace and Linus. Ada owns the space
 * and is not in the conversation; Margaret is in the space and not in the conversation
 */
async function setting() {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const margaret = await api.addPerson('Margaret');
  const made = await api.as(ada)(createSpace, { name: 'Research' });
  assert.ok(made.ok);
  const spaceId = made.data.space.id;
  await api.db
    .insert(spaceMembers)
    .values([grace, linus, margaret].map((person) => ({ spaceId, userId: person.id, role: 'editor' as const })));
  const started = await api.as(grace)(createConversation, { spaceId, title: 'Launch plan' });
  assert.ok(started.ok);
  const conversationId = started.data.conversation.id;
  const added = await api.as(grace)(addConversationMember, { spaceId, conversationId, userId: linus.id });
  assert.ok(added.ok);
  return { ada, grace, linus, margaret, spaceId, conversationId, place: { spaceId, conversationId } };
}

test('a message is told to whoever can read its conversation, with the number it has: the members and the owner of the space, and nobody else', async () => {
  const { ada, grace, linus, margaret, spaceId, conversationId, place } = await setting();
  const [owner, member, stranger] = [
    await listen(ada, spaceId),
    await listen(linus, spaceId),
    await listen(margaret, spaceId)
  ];

  assert.equal((await api.as(grace)(createMessage, { ...place, text: 'Shall we ship on Friday?' })).ok, true);
  assert.equal((await api.as(grace)(createMessage, { ...place, text: 'Or on Monday.' })).ok, true);

  // What happened is told, and not what was said
  const told = [
    { type: 'message', conversationId, number: 1 },
    { type: 'message', conversationId, number: 2 }
  ];
  assert.deepEqual([await member.next(), await member.next()], told);
  assert.deepEqual([await owner.next(), await owner.next()], told);
  // In the space, and not in the conversation: nothing
  assert.deepEqual(await stranger.waiting(), []);
});

test('what else happens to a conversation is told as a change of it, also to whoever it is gone for', async () => {
  const { ada, grace, linus, margaret, spaceId, conversationId, place } = await setting();
  const changed = { type: 'conversation', conversationId };
  const [hers, his, theirs] = [
    await listen(grace, spaceId),
    await listen(linus, spaceId),
    await listen(margaret, spaceId)
  ];

  // A new title, and a message deleted
  assert.equal((await api.as(grace)(updateConversation, { ...place, title: 'Launch' })).ok, true);
  assert.deepEqual(await his.next(), changed);
  assert.equal((await api.as(grace)(createMessage, { ...place, text: 'Oops.' })).ok, true);
  assert.equal((await his.next()).type, 'message');
  assert.equal((await api.as(grace)(deleteMessage, { ...place, number: 1 })).ok, true);
  assert.deepEqual(await his.next(), changed);
  assert.deepEqual(await theirs.waiting(), []);

  // Whoever is added hears of the conversation that is new to them
  assert.equal((await api.as(grace)(addConversationMember, { ...place, userId: margaret.id })).ok, true);
  assert.deepEqual(await theirs.next(), changed);

  // Whoever is taken out hears that it is gone for them, and so does whoever leaves
  assert.equal((await api.as(ada)(removeConversationMember, { ...place, userId: margaret.id })).ok, true);
  assert.deepEqual(await theirs.next(), changed);
  await his.waiting();
  assert.equal((await api.as(linus)(leaveConversation, place)).ok, true);
  assert.deepEqual(await his.next(), changed);

  // A conversation that is deleted is told to the whole space: who was in it went with it
  await hers.waiting();
  assert.equal((await api.as(ada)(deleteConversation, place)).ok, true);
  assert.deepEqual(await hers.next(), changed);
  assert.deepEqual(await theirs.next(), changed);
});

test('a new conversation is told to whoever started it and to the owner of the space; nothing of one space is told in another', async () => {
  const { ada, grace, linus, spaceId } = await setting();
  const elsewhere = await api.as(grace)(createSpace, { name: 'Private' });
  assert.ok(elsewhere.ok);
  const other = elsewhere.data.space.id;
  const [owner, hers, his, inTheOther] = [
    await listen(ada, spaceId),
    await listen(grace, spaceId),
    await listen(linus, spaceId),
    await listen(grace, other)
  ];

  const started = await api.as(grace)(createConversation, { spaceId, title: 'Budget' });
  assert.ok(started.ok);
  const told = { type: 'conversation', conversationId: started.data.conversation.id };

  assert.deepEqual(await hers.next(), told);
  assert.deepEqual(await owner.next(), told);
  assert.deepEqual(await his.waiting(), []);
  assert.deepEqual(await inTheOther.waiting(), []);
});

test('a channel is opened by a member of the space, signed in or with an API key, a read-only one too', async () => {
  const { grace, margaret, spaceId, conversationId, place } = await setting();
  const made = await api.as(grace)(createApiKey, { name: 'Research agent', permission: 'read' });
  assert.ok(made.ok);

  const agent = await listen({ key: made.data.apiKey.key }, spaceId);
  assert.equal((await api.as(grace)(createMessage, { ...place, text: 'Hello.' })).ok, true);
  // The agent is told what its person is told
  assert.deepEqual(await agent.next(), { type: 'message', conversationId, number: 1 });

  const codeOf = async (response: Response) => {
    const body = (await response.json()) as { error?: { code: string } };
    return [response.status, body.error?.code];
  };
  assert.deepEqual(await codeOf(await api.send(null, eventsPath({ spaceId }))), [401, 'UNAUTHENTICATED']);
  assert.deepEqual(await codeOf(await api.send({ key: 'pm_not_a_key' }, eventsPath({ spaceId }))), [
    401,
    'UNAUTHENTICATED'
  ]);
  const outsider = await api.addPerson('Dennis');
  assert.deepEqual(await codeOf(await api.send(outsider, eventsPath({ spaceId }))), [404, 'UNKNOWN_SPACE']);
  assert.deepEqual(await codeOf(await api.send(margaret, eventsPath({ spaceId: NOBODY }))), [404, 'UNKNOWN_SPACE']);
  // A query that does not fit: no space, a field the address does not have
  for (const query of ['', '?spaceId=1', `?spaceId=${spaceId}&conversationId=${conversationId}`]) {
    assert.deepEqual(await codeOf(await api.send(grace, `/api/events${query}`)), [400, 'INVALID_INPUT'], query);
  }
});

test('a channel is written a ping at intervals, and is ended by the server when its time is up', async () => {
  const { grace, spaceId } = await setting();
  // An app of its own, on the same database, with the times of a channel made short
  const app = createApp({
    auth: { handler: async () => new Response(null, { status: 404 }) },
    webOrigins: [],
    implementations: [],
    identifyCaller: async () => ({ user: grace }),
    spaceMembership: async () => ({ role: 'editor' }),
    conversationAccess: async () => null,
    reportError: (error) => assert.fail(`the server reported ${String(error)}`),
    events: { db: api.db, timings: { pingMs: 20, lifetimeMs: 200 } }
  });
  const started = Date.now();

  const listening = read(await app.request(eventsPath({ spaceId })));
  assert.deepEqual(await listening.next(), { type: 'open' });
  await listening.ended;

  const lasted = Date.now() - started;
  assert.ok(lasted >= 180 && lasted < 1500, `the channel lasted ${lasted} ms`);
  assert.ok(listening.pings() >= 3, `${listening.pings()} pings came`);
});

test('every channel is ended when the process is told to stop, and one opened after that ends at once', async () => {
  const { grace, spaceId } = await setting();
  const stopping = new AbortController();
  const app = createApp({
    auth: { handler: async () => new Response(null, { status: 404 }) },
    webOrigins: [],
    implementations: [],
    identifyCaller: async () => ({ user: grace }),
    spaceMembership: async () => ({ role: 'editor' }),
    conversationAccess: async () => null,
    reportError: (error) => assert.fail(`the server reported ${String(error)}`),
    events: { db: api.db, stopping: stopping.signal }
  });
  const before = read(await app.request(eventsPath({ spaceId })));
  assert.deepEqual(await before.next(), { type: 'open' });

  stopping.abort();
  await before.ended;

  const after = read(await app.request(eventsPath({ spaceId })));
  await after.ended;
});
