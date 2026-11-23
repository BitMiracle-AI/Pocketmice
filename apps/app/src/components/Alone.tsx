import type { ReactNode } from 'react';

// A page that stands alone, with no sidebar: signing in, the page of someone who is in no space yet, an address
// with nothing at it, a page that failed to load.

/** The page: the name of the product in the corner, and one narrow column a little above the middle */
export function Alone({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center px-6">
        <span className="text-sm font-semibold tracking-tight">Pocketmice</span>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pt-4 pb-32">
        <div className="w-full max-w-80">{children}</div>
      </main>
    </div>
  );
}

/** What the page is, at the top of the column. children is the line or two under it that says more */
export function AloneHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <h1 className="font-heading text-xl font-medium tracking-tight">{title}</h1>
      {children && <p className="mt-2 text-sm text-pretty text-muted-foreground">{children}</p>}
    </>
  );
}

/** The quiet line under what the page is for: a way to another page, or who is signed in */
export function AloneFoot({ children }: { children: ReactNode }) {
  return <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">{children}</p>;
}

/** How a link or a button inside that line looks: the words alone, underlined when pointed at */
export const ALONE_LINK =
  'rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline disabled:opacity-50';
