import { ChannelFailure, readEvents } from '@pocketmice/client/events';
import type { EventsQuery, SpaceEvent } from '@pocketmice/contract/domains/event';
import { errorOf } from './pocketmiceError.ts';

/** What the method is called in the errors it throws */
const NAME = 'watchSpace';

export interface EventMethods {
  /**
   * What happens in a space, as it happens: one channel of events, read with `for await`. An event says that
   * something changed and not what it changed to: read that with the methods of the operations.
   * - `{type: 'open'}` comes first: nothing is missed from here on. Read what you hold once more when you get it.
   * - `{type: 'message', conversationId, number}`: a conversation the person can read has reached this message.
   *   getMessages with the number of the last message you have answers with what is new.
   * - `{type: 'conversation', conversationId}`: something else about a conversation changed, or it is new to the
   *   person, or gone for them.
   * It is one request, like every method. The server ends a channel after a few minutes, and the loop then ends
   * without an error: call it again to go on, and do on its open what you do on any event. Leaving the loop, or
   * signal, gives the channel up.
   * UNKNOWN_SPACE: the person is not a member of the space. UNREACHABLE: the server could not be reached, or the
   * channel broke off or went silent; call it again after a moment.
   */
  watchSpace: (input: EventsQuery, options?: { signal?: AbortSignal }) => AsyncIterable<SpaceEvent>;
}

/** Sends one request as the holder of the key (see pocketmice.ts) */
type Send = (url: string, init: { method: string; signal?: AbortSignal }) => Promise<Response>;

export function eventMethods(baseUrl: string, send: Send): EventMethods {
  return {
    watchSpace: async function* (input, options) {
      try {
        yield* readEvents({ baseUrl, fetch: send }, input, options?.signal);
      } catch (thrown) {
        // A failure of the channel is thrown as every method throws; anything else is a bug on this side, and is
        // thrown the same way so that a method only ever throws one thing
        if (thrown instanceof ChannelFailure) throw errorOf(thrown.failure, NAME);
        throw errorOf(
          { ok: false, code: 'UNEXPECTED', message: `Reading ${NAME} failed on this side.`, cause: thrown },
          NAME
        );
      }
    }
  };
}
