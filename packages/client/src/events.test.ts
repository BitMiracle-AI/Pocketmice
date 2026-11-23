import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SpaceEvent } from '@pocketmice/contract/domains/event';
import { ChannelFailure, type EventsConfig, readEvents } from './events.ts';

const SPACE = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';

/** A channel a test writes: the answer to the request, and what was asked for */
function channel(status = 200) {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const requests: { url: string; signal: AbortSignal }[] = [];
  const body = new ReadableStream<Uint8Array>({
    start: (created) => {
      controller = created;
    }
  });
  const fetch: EventsConfig['fetch'] = async (url, init) => {
    requests.push({ url, signal: init.signal });
    // A fetch gives up when its signal fires: the reading throws what a real one throws
    init.signal.addEventListener('abort', () => {
      try {
        controller?.error(new DOMException('This operation was aborted', 'AbortError'));
      } catch {
        // The channel had ended already
      }
    });
    return { status, text: async () => '{"error":{"code":"UNKNOWN_SPACE","message":"No such space."}}', body };
  };
  return {
    config: { baseUrl: 'http://api.test', fetch } satisfies EventsConfig,
    requests,
    write: (text: string) => controller?.enqueue(encoder.encode(text)),
    end: () => controller?.close()
  };
}

/** Everything a channel hands out until it ends or fails */
async function all(events: AsyncIterable<SpaceEvent>): Promise<SpaceEvent[]> {
  const read: SpaceEvent[] = [];
  for await (const event of events) read.push(event);
  return read;
}

test('a channel is a GET of the events of the space, and hands out its events until the server ends it', async () => {
  const { config, requests, write, end } = channel();
  const reading = all(readEvents(config, { spaceId: SPACE }));

  write('data: {"type":"open"}\n\n');
  // Two events in one piece, and one that arrives in two
  write(
    `data: {"type":"message","conversationId":"${CONVERSATION}","number":3}\n\ndata: {"type":"ping"}\n\ndata: {"type":"conv`
  );
  write(`ersation","conversationId":"${CONVERSATION}"}\n\n`);
  // A type this side does not know, and a line that is no event, are passed over
  write('data: {"type":"fileChanged","fileId":"x"}\n\n: a comment\n\ndata: not json\n\n');
  end();

  assert.deepEqual(await reading, [
    { type: 'open' },
    { type: 'message', conversationId: CONVERSATION, number: 3 },
    { type: 'conversation', conversationId: CONVERSATION }
  ]);
  assert.deepEqual(
    requests.map(({ url }) => url),
    [`http://api.test/api/events?spaceId=${SPACE}`]
  );
  // The request is not left open
  assert.equal(requests[0]?.signal.aborted, true);
});

test('a channel the server refuses throws its code', async () => {
  const { config } = channel(404);

  await assert.rejects(all(readEvents(config, { spaceId: SPACE })), (thrown) => {
    assert.ok(thrown instanceof ChannelFailure);
    assert.equal(thrown.failure.code, 'UNKNOWN_SPACE');
    return true;
  });
});

test('a channel on which nothing arrives is taken for broken: UNREACHABLE, and a ping is enough to keep it', async () => {
  const { config, write } = channel();
  const read: SpaceEvent[] = [];
  const started = Date.now();

  const reading = (async () => {
    for await (const event of readEvents({ ...config, silenceMs: 80 }, { spaceId: SPACE })) read.push(event);
  })();
  write('data: {"type":"open"}\n\n');
  // Pings for a while: longer than the silence allowed
  for (let sent = 0; sent < 5; sent++) {
    await new Promise((resolve) => setTimeout(resolve, 40));
    write('data: {"type":"ping"}\n\n');
  }

  await assert.rejects(reading, (thrown) => {
    assert.ok(thrown instanceof ChannelFailure);
    assert.equal(thrown.failure.code, 'UNREACHABLE');
    return true;
  });
  assert.ok(Date.now() - started >= 200 + 70, 'the pings kept it open, and then the silence was waited out');
  assert.deepEqual(read, [{ type: 'open' }]);
});

test('how long the caller takes over an event is not silence: what was written meanwhile is handed out after it', async () => {
  const { config, write, end } = channel();
  const read: SpaceEvent[] = [];

  const reading = (async () => {
    for await (const event of readEvents({ ...config, silenceMs: 60 }, { spaceId: SPACE })) {
      read.push(event);
      // An agent that thinks about what it heard, for longer than the silence allowed
      if (event.type === 'open') await new Promise((resolve) => setTimeout(resolve, 200));
      // The server ends the channel when the caller has what it wrote meanwhile. Not at a time of its own: once
      // the caller reads again the silence is counted again, and a time set here would have to come before that
      if (event.type === 'message') end();
    }
  })();
  write('data: {"type":"open"}\n\n');
  await new Promise((resolve) => setTimeout(resolve, 30));
  write(`data: {"type":"message","conversationId":"${CONVERSATION}","number":4}\n\n`);

  await reading;
  assert.deepEqual(read, [{ type: 'open' }, { type: 'message', conversationId: CONVERSATION, number: 4 }]);
});

test('a server that cannot be reached is UNREACHABLE, and what fetch threw is the cause', async () => {
  const thrown = new TypeError('fetch failed');
  const config: EventsConfig = {
    baseUrl: 'http://api.test',
    fetch: async () => {
      throw thrown;
    }
  };

  await assert.rejects(all(readEvents(config, { spaceId: SPACE })), (failed) => {
    assert.ok(failed instanceof ChannelFailure);
    assert.equal(failed.failure.code, 'UNREACHABLE');
    assert.equal(failed.cause, thrown);
    return true;
  });
});

test('a caller that stops reading, or whose signal fires, gives the channel up without an error', async () => {
  const left = channel();
  left.write('data: {"type":"open"}\n\n');
  for await (const event of readEvents(left.config, { spaceId: SPACE })) {
    assert.deepEqual(event, { type: 'open' });
    break;
  }
  // The loop is left before anything is written after the open
  assert.equal(left.requests[0]?.signal.aborted, true);

  const stopped = channel();
  const stopping = new AbortController();
  const reading = all(readEvents(stopped.config, { spaceId: SPACE }, stopping.signal));
  stopped.write('data: {"type":"open"}\n\n');
  await new Promise((resolve) => setTimeout(resolve, 20));
  stopping.abort();

  assert.deepEqual(await reading, [{ type: 'open' }]);
  assert.equal(stopped.requests[0]?.signal.aborted, true);
});
