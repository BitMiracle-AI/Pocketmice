import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Brand } from './Brand';

/**
 * A page that has nothing to show and says why, with no sidebar and so on the frame: an address with nothing at
 * it, a space the person is not in, a page that failed to load. The name of the product is in its corner, and
 * leads to the start; children is the way on.
 */
export function EmptyPage({
  icon,
  title,
  description,
  children
}: {
  icon: IconSvgElement;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="on-frame flex min-h-svh flex-col">
      <header className="flex h-16 shrink-0 items-center px-4 lg:px-6">
        <Brand />
      </header>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>
            <h1>{title}</h1>
          </EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>{children}</EmptyContent>
      </Empty>
    </div>
  );
}
