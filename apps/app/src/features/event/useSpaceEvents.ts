import { useEffect } from 'react';
import { conversationsChanged } from '@/features/conversation/conversations';
import { usePageVisible } from '@/hooks/usePageVisible';
import { heardFailure, spaceEvents } from '@/lib/api';
import { keepListening } from './keepListening';

// What happens in a space reaches the page that is open on it: the frame of a space listens to its events, on
// whichever of its pages the person is.
// - An event says that something changed and not what. Hearing one marks what was read about it as stale, the
//   way a write on this page does, and the cache asks again for what a page is showing. Nothing is kept here.
// - A channel begins with open, which marks everything about the conversations of the space as stale: whatever was
//   said while no channel was open is read then.
// - Only a page the person can see listens. One in a tab at the back gives its channel up, and opens one when it
//   comes to the front: that one begins with open, like every other. A browser allows a page only so many requests
//   at a time to one server, and a channel is a request that stays open, so tabs nobody looks at must not hold one.

/** Resolves after ms milliseconds, or at once when signal fires */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
    if (signal.aborted) done();
  });
}

/**
 * Hears what happens in the space spaceId for as long as the component that calls it is drawn and the person can
 * see the page.
 */
export function useSpaceEvents(spaceId: string): void {
  const visible = usePageVisible();
  useEffect(() => {
    if (!visible) return;
    const stopped = new AbortController();
    keepListening(
      {
        open: (signal) => spaceEvents({ spaceId }, signal),
        heard: (event) => conversationsChanged(spaceId, event.type === 'open' ? undefined : event.conversationId),
        // A channel that is refused says what any refused call says: who is signed in, or which spaces are theirs,
        // is not what the cache holds
        failed: heardFailure,
        wait
      },
      stopped.signal
    ).catch((error: unknown) => console.error('Listening to the events of a space failed:', error));
    return () => stopped.abort();
  }, [spaceId, visible]);
}
