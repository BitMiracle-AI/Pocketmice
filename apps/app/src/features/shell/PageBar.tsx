import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

/**
 * The bar across the top of a page inside the frame: the switch of the sidebar, then what the page is, and at the
 * right end what can be done on it (actions). What the page is, is its title; a page that has a way down to show
 * (the files) hands that in as children instead.
 */
export function PageBar({ title, children, actions }: { title?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {title !== undefined && <h1 className="truncate text-lg font-semibold">{title}</h1>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
