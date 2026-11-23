import { ChannelFailure } from '@pocketmice/client/events';
import type { SpaceEvent } from '@pocketmice/contract/domains/event';

// How a page goes on hearing what happens in a space. A channel of events is one request, and the server ends it
// after a few minutes (the rules are in the contract, domains/event.ts): hearing on is opening the next one, and
// this is the page's way of doing that.
// - After a channel that handed out something, the next is opened after a short pause, whether the server ended it
//   or it broke. The pause is there for a server that is stopping: it ends every channel the moment it is opened.
// - A channel that handed out nothing did not work: the server cannot be reached, or answers with a failure. The
//   pause doubles with each one in a row, up to a limit, so a server that is down is not asked many times a second.
// - A channel the server refuses because of who is asking is not opened again: the answer would be the same.
// Nothing is kept for the time in between: every channel begins with open, and whoever hears it reads what they
// hold once more.

/** How long after a channel that worked the next is opened, in milliseconds */
export const PAUSE_MS = 1000;

/** The longest pause between two channels that did not work, in milliseconds */
export const PAUSE_MAX_MS = 30_000;

/** The codes that say the caller may not have a channel: asking again changes nothing */
const REFUSALS: readonly string[] = ['UNAUTHENTICATED', 'FORBIDDEN', 'UNKNOWN_SPACE', 'INVALID_INPUT'];

export interface Listening {
  /** Opens one channel and hands out its events; throws a ChannelFailure when it cannot be opened or breaks */
  open: (signal: AbortSignal) => AsyncIterable<SpaceEvent>;
  /** Called with every event, in the order they came */
  heard: (event: SpaceEvent) => void;
  /** Called with the code of every channel that failed, a refusal too */
  failed: (code: string) => void;
  /** Resolves after ms milliseconds, or at once when signal fires */
  wait: (ms: number, signal: AbortSignal) => Promise<void>;
}

/**
 * Opens channel after channel until stopped fires, or until the server refuses one for good. It resolves then, and
 * throws only what is no failure of a channel: a bug on this side.
 */
export async function keepListening({ open, heard, failed, wait }: Listening, stopped: AbortSignal): Promise<void> {
  /** How many channels in a row handed out nothing */
  let silent = 0;
  while (!stopped.aborted) {
    let gave = false;
    try {
      for await (const event of open(stopped)) {
        gave = true;
        heard(event);
      }
    } catch (thrown) {
      if (!(thrown instanceof ChannelFailure)) throw thrown;
      failed(thrown.failure.code);
      if (REFUSALS.includes(thrown.failure.code)) return;
    }
    silent = gave ? 0 : silent + 1;
    await wait(Math.min(PAUSE_MAX_MS, PAUSE_MS * 2 ** silent), stopped);
  }
}
