import {
  EVENTS_SILENCE_MS,
  type EventsQuery,
  eventsPath,
  type SpaceEvent,
  spaceEvent
} from '@pocketmice/contract/domains/event';
import { type Failure, failureOf, failureOfThrown } from './api.ts';

// The caller's end of a channel of events (the rules are in the contract, domains/event.ts): one request whose
// answer is read as it arrives, an event at a time. Every kind of caller reads a channel through here: a web page,
// a program with an API key.
// One call is one channel. A channel ends, by the rules, after a few minutes: whoever wants to go on hearing opens
// the next, and that is theirs to do, since what to do in between differs: a page waits a little longer each time
// the server cannot be reached, a program may give up.

export interface EventsConfig {
  /** The address of the api, like https://api.example.com */
  baseUrl: string;
  /**
   * The function that sends the request. How the caller proves who it is, is added here by each kind of caller.
   * What comes back must be readable as it arrives (body is a stream): the fetch of a browser and of Node both are.
   */
  fetch: (
    url: string,
    init: { method: 'GET'; signal: AbortSignal }
  ) => Promise<{ status: number; text: () => Promise<string>; body: ReadableStream<Uint8Array> | null }>;
  /** How long no byte arrives before the channel is taken for broken, in milliseconds. A test shortens it */
  silenceMs?: number;
}

/**
 * What reading a channel throws when the channel fails: it could not be opened, or it broke. failure says why, the
 * way a call of an operation does: a code the server refused with, or UNREACHABLE for a server that cannot be
 * reached and for a channel that broke off or went silent.
 */
export class ChannelFailure extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(failure.message, failure.cause === undefined ? undefined : { cause: failure.cause });
    this.name = 'ChannelFailure';
    this.failure = failure;
  }
}

/** What the failures of a channel name it as, in their messages */
const NAME = 'the events of a space';

/**
 * Opens one channel of a space and hands out its events as they arrive. The first is open; pings are not handed
 * out, and neither is an event of a type this side does not know.
 * It ends when the server ends the channel, when signal fires, or when the caller stops reading (leaves the loop):
 * the request is given up then. It throws a ChannelFailure when the channel cannot be opened or breaks.
 */
export async function* readEvents(
  config: EventsConfig,
  query: EventsQuery,
  signal?: AbortSignal
): AsyncGenerator<SpaceEvent, void, void> {
  const url = new URL(eventsPath(query), config.baseUrl).href;
  const silenceMs = config.silenceMs ?? EVENTS_SILENCE_MS;
  // Taken out of the config and called on its own: a browser's fetch only runs as the window's
  const send = config.fetch;
  const request = new AbortController();
  const stop = () => request.abort();
  signal?.addEventListener('abort', stop);
  if (signal?.aborted) stop();

  // Silence is counted while this side waits for the server: for the answer to begin, and then for each piece of
  // it, so a server that takes the connection and answers nothing is given up on as well. By bytes and not by
  // events: a ping is enough. It is not counted while the caller has an event in hand: how long a caller takes
  // over one says nothing about the channel, and what the server writes meanwhile is read when the caller is back
  let silent = false;
  const fromServer = async <T>(arriving: Promise<T>): Promise<T> => {
    const timer = setTimeout(() => {
      silent = true;
      request.abort();
    }, silenceMs);
    try {
      return await arriving;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const response = await fromServer(send(url, { method: 'GET', signal: request.signal }));
    if (response.status !== 200 || !response.body) {
      throw new ChannelFailure(failureOf(NAME, response.status, await fromServer(response.text()), []));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await fromServer(reader.read());
      if (done) return;
      text += decoder.decode(value, { stream: true });
      // An event is one line, `data: <JSON>`, and an empty line after it. A piece that arrives may hold several
      // events, or the beginning of one
      for (let end = text.indexOf('\n\n'); end >= 0; end = text.indexOf('\n\n')) {
        const line = text.slice(0, end);
        text = text.slice(end + 2);
        const event = line.startsWith(DATA) ? spaceEvent.safeParse(parseJson(line.slice(DATA.length))) : undefined;
        if (event?.success) yield event.data;
      }
    }
  } catch (thrown) {
    if (thrown instanceof ChannelFailure) throw thrown;
    // Given up by the caller: that is not a failure
    if (signal?.aborted) return;
    if (silent) {
      throw new ChannelFailure({
        ok: false,
        code: 'UNREACHABLE',
        message: `The channel went silent: nothing arrived for ${silenceMs} ms.`,
        cause: thrown
      });
    }
    throw new ChannelFailure(failureOfThrown(thrown, NAME));
  } finally {
    signal?.removeEventListener('abort', stop);
    // Whichever way the reading ended, the request is not left open
    request.abort();
  }
}

/** How the line of an event begins */
const DATA = 'data: ';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
