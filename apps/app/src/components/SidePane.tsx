import { cn } from 'cn';
import type { ComponentProps } from 'react';

/**
 * What stands beside the work and is about one thing of it: the pane of what is picked among the files, and the
 * pane beside a conversation. It is on the quiet ground, which tells it from the tile it stands against with no
 * line between them. className gives its width.
 */
export function SidePane({ className, ...props }: ComponentProps<'aside'>) {
  return <aside className={cn('on-quiet flex min-h-0 shrink-0 flex-col', className)} {...props} />;
}
