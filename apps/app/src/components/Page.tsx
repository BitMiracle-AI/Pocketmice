import { cn } from 'cn';
import type { ReactNode } from 'react';

// The bones of a page inside the frame: a column in the middle, with a head (what the page is, what can be done on
// it, one line about it) and under it what the page lists.

/** A page: it scrolls by itself, and its content is a column in the middle. wide is for a list with columns */
export function Page({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        className={cn('mx-auto flex w-full flex-1 flex-col gap-6 px-6 pt-6 pb-12', wide ? 'max-w-5xl' : 'max-w-3xl')}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The top of a page: its title, with a mark before it (mark) and a label after it (tag), the buttons of the page
 * at the right (children), and under it what is said about the page (hint), with the lines it was written in
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
