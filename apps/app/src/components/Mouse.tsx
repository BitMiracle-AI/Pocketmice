import { cn } from 'cn';

/**
 * The mouse looking out of its folder: the drawing the tab of the browser has (public/favicon.svg), shown large
 * where a place has nothing in it yet. It is decoration: the words next to it say what there is to say.
 */
export function Mouse({ className }: { className?: string }) {
  return <img src="/favicon.svg" alt="" className={cn('size-24 select-none', className)} draggable={false} />;
}
