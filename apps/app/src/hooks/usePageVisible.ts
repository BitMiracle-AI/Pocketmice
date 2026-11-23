import { useSyncExternalStore } from 'react';

const subscribe = (listener: () => void): (() => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

/**
 * Whether the person can see the page: its tab is the one in front, and its window is not put away. What only
 * matters to someone looking (hearing what happens the moment it does, counting something as read) goes by it.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, () => document.visibilityState === 'visible');
}
