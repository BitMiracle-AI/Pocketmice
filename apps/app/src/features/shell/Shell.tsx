import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@/components/ui/sidebar';
import { UserMenu } from './UserMenu';

// The frame every signed-in page sits in: the sidebar on the left, and the page as a card on the sidebar's colour.
// What the sidebar holds differs with where the page is (inside a space, or in the settings, which belong to the
// person and to no space), so the frame is given its three parts; the bottom always ends with who is signed in.
// Every piece is the sidebar of shadcn as it comes, at its own sizes.

export function Shell({
  top,
  nav,
  bottom,
  children
}: {
  /** The top of the sidebar: where the page is, and the way to elsewhere */
  top: ReactNode;
  /** The rows of the sidebar: the pages there are here */
  nav: ReactNode;
  /** Rows at the bottom of the sidebar, above who is signed in */
  bottom?: ReactNode;
  /** The page */
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>{top}</SidebarMenu>
        </SidebarHeader>
        <SidebarContent>{nav}</SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {bottom}
            <UserMenu />
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/* As high as the window and no higher: a page scrolls inside the card, and the sidebar stays where it is */}
      <SidebarInset className="h-svh min-w-0 overflow-hidden md:h-[calc(100svh-(--spacing(4)))] md:border">
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * A row of the sidebar that leads to a page. link is the link itself, with nothing in it (a Link of the router
 * with its address): the row puts the icon and the label inside. active says the page being shown is this one.
 */
export function NavRow({
  link,
  icon,
  label,
  active
}: {
  link: React.ReactElement;
  icon: IconSvgElement;
  label: string;
  active: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton render={link} isActive={active}>
        <HugeiconsIcon icon={icon} strokeWidth={2} />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
