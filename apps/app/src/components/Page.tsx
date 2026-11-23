import { cn } from 'cn';
import type { ReactNode } from 'react';

/**
 * What is under the bar of a page that is read from top to bottom: it scrolls by itself, and what it holds is a
 * column in the middle. wide is for a list with columns, which takes the whole width.
 */
export function Page({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className={cn('mx-auto flex w-full flex-1 flex-col gap-6 p-4 md:p-6', !wide && 'max-w-3xl')}>{children}</div>
    </div>
  );
}

/**
 * The top of a page as the pages before the redesign have it. It goes when the last of them is laid out anew: what
 * a page is called is in its bar (PageBar).
 */
export function PageHead({
  title,
  mark,
  tag,
  hint,
  children
}: {
  title: string;
  mark?: ReactNode;
  tag?: ReactNode;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex min-h-8 items-center gap-2.5">
        {mark}
        <h1 className="truncate font-heading text-lg font-medium tracking-tight">{title}</h1>
        {tag}
        {children && <div className="ml-auto flex shrink-0 items-center gap-2">{children}</div>}
      </div>
      {hint && <p className="max-w-xl text-sm text-pretty whitespace-pre-line text-muted-foreground">{hint}</p>}
    </header>
  );
}
