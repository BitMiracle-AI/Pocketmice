import { useState } from 'react';

/**
 * value, and while it is null the last value that was not. For a dialog that is open while it is given something
 * to act on: when that is taken away the dialog closes, and what it shows while it goes is still what it showed.
 */
export function useLastGiven<Value>(value: Value | null): Value | null {
  const [last, setLast] = useState(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
