import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * Whether an element is at least least pixels wide, kept up as it changes: the element is the one the ref is put
 * on. For a layout that puts two things side by side where there is room for both, and one over the other where
 * there is not, and has to render them differently in the two cases. (Where only the look differs, the style
 * sheet asks by itself.) Until the element is measured it counts as wide.
 */
export function useIsWide<Element extends HTMLElement>(least: number): [RefObject<Element | null>, boolean] {
  const ref = useRef<Element>(null);
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const look = () => setWide(element.clientWidth >= least);
    look();
    const observer = new ResizeObserver(look);
    observer.observe(element);
    return () => observer.disconnect();
  }, [least]);
  return [ref, wide];
}
