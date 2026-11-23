import { createContext, type ReactNode, use } from 'react';
import type { Space } from './spaces';

// The space a page is in. Which one is said by the address, and read from it in one place: the route every page
// of a space is under (routes/_app/spaces/$spaceId.tsx). The pages under it ask here.

const CurrentSpace = createContext<Space | null>(null);

export function CurrentSpaceProvider({ space, children }: { space: Space; children: ReactNode }) {
  return <CurrentSpace value={space}>{children}</CurrentSpace>;
}

/** The space this page is in, with the person's role in it. For a page under the route of a space */
export function useCurrentSpace(): Space {
  const space = use(CurrentSpace);
  if (!space) throw new Error('useCurrentSpace was called outside the pages of a space.');
  return space;
}
