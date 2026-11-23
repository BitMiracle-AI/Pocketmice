import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { commonText } from '@/lib/text';

// A page that stands alone, with no sidebar: signing in, the start, an address with nothing at it, a page that
// failed to load.

/**
 * The page: the bar across its top, and one narrow column a little above the middle. corner is what the bar holds
 * in its other corner.
 */
export function Alone({ corner, children }: { corner?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AloneBar corner={corner} />
      <main className="flex flex-1 items-center justify-center px-6 pt-4 pb-32">
        <div className="w-full max-w-80">{children}</div>
      </main>
    </div>
  );
}

/**
 * The bar across the top of such a page: the name of the product in one corner, and in the other what the page
 * puts there (who is signed in). By itself it is for a page that is wider than the one column.
 */
export function AloneBar({ corner }: { corner?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between pr-4 pl-6">
      <span className="text-sm font-semibold tracking-tight">Pocketmice</span>
      {corner}
    </header>
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

/** The way on from a page that has nothing to show: to the start, where the person's spaces are */
export function AloneWayHome() {
  return (
    <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-8' })}>
      {commonText.toHome}
    </Link>
  );
}

/** The quiet line under what the page is for: a way to another page, or who is signed in */
export function AloneFoot({ children }: { children: ReactNode }) {
  return <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">{children}</p>;
}

/** How a link or a button inside that line looks: the words alone, underlined when pointed at */
export const ALONE_LINK =
  'rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline disabled:opacity-50';
