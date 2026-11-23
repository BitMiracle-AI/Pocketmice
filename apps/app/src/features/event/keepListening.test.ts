// The rules of hearing on, with channels that are made up. To run it, in apps/app:
// node --test src/features/event/keepListening.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelFailure } from '@pocketmice/client/events';
import type { SpaceEvent } from '@pocketmice/contract/domains/event';
import { keepListening, PAUSE_MAX_MS, PAUSE_MS } from './keepListening.ts';

/** What one made-up channel does: the events it hands out, and then how it ends */
interface Channel {
  events: SpaceEvent[];
  /** The code it fails with after its events. Left out, the server ends it */
  fails?: string;
}

const OPEN: SpaceEvent = { type: 'open' };
const MESSAGE: SpaceEvent = { type: 'message', conversationId: 'c1', number: 7 };

/**
 * Listens to the channels given, one after the other, and stops when they are used up. Answers with what was
 * heard, the codes that failed, the pauses that were waited, and how many channels were opened.
 */
async function listen(channels: Channel[]) {
  const stop = new AbortController();
  const heard: SpaceEvent[] = [];
  const failed: string[] = [];
  const pauses: number[] = [];
  let opened = 0;

  await keepListening(
    {
      open: async function* () {
        const channel = channels[opened];
        opened += 1;
        if (!channel) throw new Error('A channel was opened after listening was stopped.');
        yield* channel.events;
        if (channel.fails) {
          throw new ChannelFailure({ ok: false, code: channel.fails as 'UNREACHABLE', message: 'made up' });
        }
      },
      heard: (event) => heard.push(event),
      failed: (code) => failed.push(code),
      wait: async (ms) => {
        pauses.push(ms);
        // The pause after the last channel there is: the page went away during it
        if (opened === channels.length) stop.abort();
      }
    },
    stop.signal
  );
  return { heard, failed, pauses, opened };
}

test('a channel the server ends is followed by the next after a short pause, and every event is handed on', async () => {
  const { heard, failed, pauses, opened } = await listen([
    { events: [OPEN, MESSAGE] },
    { events: [OPEN] },
    { events: [OPEN, MESSAGE] }
  ]);

  assert.deepEqual(heard, [OPEN, MESSAGE, OPEN, OPEN, MESSAGE]);
  assert.deepEqual(failed, []);
  assert.deepEqual(pauses, [PAUSE_MS, PAUSE_MS, PAUSE_MS]);
  assert.equal(opened, 3);
});

test('a channel that breaks after it worked is followed by the next after the same short pause', async () => {
  const { failed, pauses } = await listen([{ events: [OPEN, MESSAGE], fails: 'UNREACHABLE' }, { events: [OPEN] }]);

  assert.deepEqual(failed, ['UNREACHABLE']);
  assert.deepEqual(pauses, [PAUSE_MS, PAUSE_MS]);
});

test('the pause doubles with each channel in a row that handed out nothing, up to a limit, and starts over once one works', async () => {
  const down: Channel = { events: [], fails: 'UNREACHABLE' };
  const { failed, pauses } = await listen([
    down,
    down,
    down,
    down,
    down,
    down,
    // A channel that ends without a word counts the same as one that fails
    { events: [] },
    { events: [OPEN] },
    down
  ]);

  assert.equal(failed.length, 7);
  assert.deepEqual(pauses, [
    2 * PAUSE_MS,
    4 * PAUSE_MS,
    8 * PAUSE_MS,
    16 * PAUSE_MS,
    PAUSE_MAX_MS,
    PAUSE_MAX_MS,
    PAUSE_MAX_MS,
    PAUSE_MS,
    2 * PAUSE_MS
  ]);
});

test('a channel the server refuses because of who is asking is not opened again', async () => {
  for (const code of ['UNAUTHENTICATED', 'UNKNOWN_SPACE', 'FORBIDDEN', 'INVALID_INPUT']) {
    const { failed, pauses, opened } = await listen([{ events: [], fails: code }, { events: [OPEN] }]);

    assert.deepEqual(failed, [code]);
    assert.deepEqual(pauses, [], code);
    assert.equal(opened, 1, code);
  }
});

test('a server that fails for a reason of its own is asked again', async () => {
  const { failed, opened } = await listen([
    { events: [], fails: 'INTERNAL' },
    { events: [], fails: 'BAD_RESPONSE' },
    { events: [OPEN] }
  ]);

  assert.deepEqual(failed, ['INTERNAL', 'BAD_RESPONSE']);
  assert.equal(opened, 3);
});

test('nothing is opened once listening was stopped, and what is no failure of a channel is thrown', async () => {
  const stopped = new AbortController();
  stopped.abort();
  let opened = 0;
  const deps = {
    open: async function* (): AsyncGenerator<SpaceEvent> {
      opened += 1;
      yield OPEN;
      throw new TypeError('a bug on this side');
    },
    heard: () => undefined,
    failed: () => undefined,
    wait: async () => undefined
  };

  await keepListening(deps, stopped.signal);
  assert.equal(opened, 0);

  await assert.rejects(keepListening(deps, new AbortController().signal), TypeError);
});
