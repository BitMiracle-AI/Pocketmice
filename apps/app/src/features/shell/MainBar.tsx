import { Fragment, type ReactElement, type ReactNode } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

/** One step of the way to a page. link is the link to it, with nothing in it; left out, the step leads nowhere */
export interface TrailStep {
  label: string;
  link?: ReactElement;
}

/**
 * The bar at the top of the card: the switch of the sidebar, then where the page is. The first step is the part
 * of the app the page is in (Files, Settings), as the sidebar names it; what follows is the way down to the page,
 * and title is the page itself. On a narrow screen only the page is named. children are what can be done with the
 * page from its bar, at the right end.
 */
export function MainBar({ trail, title, children }: { trail: TrailStep[]; title: string; children?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3">
      <SidebarTrigger className="text-muted-foreground" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
      />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {trail.map((step, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the steps of a trail do not change places
            <Fragment key={index}>
              <BreadcrumbItem className="min-w-0 max-sm:hidden">
                {step.link ? (
                  <BreadcrumbLink render={step.link} className="truncate">
                    {step.label}
                  </BreadcrumbLink>
                ) : (
                  <span className="truncate">{step.label}</span>
                )}
              </BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden" />
            </Fragment>
          ))}
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {children && <div className="ml-auto flex shrink-0 items-center gap-1">{children}</div>}
    </header>
  );
}
