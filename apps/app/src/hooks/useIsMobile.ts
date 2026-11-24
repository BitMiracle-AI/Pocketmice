import { useSyncExternalStore } from 'react';

/** Narrower than this many pixels, a window is laid out as a phone's: the md of the style sheet */
const MOBILE_BREAKPOINT = 768;

const NARROW = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function watch(changed: () => void): () => void {
  const query = window.matchMedia(NARROW);
  query.addEventListener('change', changed);
  return () => query.removeEventListener('change', changed);
}

/**
 * Whether the window is as narrow as a phone's, kept up as it changes. For what has to be rendered differently
 * there, and not only look different: the style sheet asks by itself where only the look differs.
 * It is known as the page is drawn, and not a moment after: a phone is never shown the wide layout first.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(watch, () => window.matchMedia(NARROW).matches);
}
