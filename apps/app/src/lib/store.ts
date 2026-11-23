import { useSyncExternalStore } from 'react';

/**
 * A value kept in the memory of this page, that can be watched: get reads it, set puts another in its place and
 * tells whoever watches, and use is the hook a component reads it with (the component is drawn again when the value
 * was replaced).
 * The value changes at set and nowhere else: between two sets, get hands out the same one, which is how a
 * component knows whether it changed. So what is handed to set is a new value, never the old one altered.
 * It is for what the page itself knows and the api does not: what the api said is in the cache (lib/api.ts).
 */
export function createStore<Value>(initial: Value) {
  let value = initial;
  const listeners = new Set<() => void>();
  const get = (): Value => value;
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  return {
    get,
    set(next: Value): void {
      value = next;
      for (const listener of listeners) listener();
    },
    use: (): Value => useSyncExternalStore(subscribe, get)
  };
}
