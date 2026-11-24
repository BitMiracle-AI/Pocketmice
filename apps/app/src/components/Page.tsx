import { cn } from 'cn';
import type { ReactNode } from 'react';

/**
 * What is under the bar of a page that is read from top to bottom: it scrolls by itself, and what it holds is a
 * column in the middle, on the quiet ground: the cards of such a page stand on it white. wide is for a list with
 * columns, which takes the whole width.
 */
export function Page({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="on-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className={cn('mx-auto flex w-full flex-1 flex-col gap-6 p-4 md:p-6', !wide && 'max-w-3xl')}>{children}</div>
    </div>
  );
}
