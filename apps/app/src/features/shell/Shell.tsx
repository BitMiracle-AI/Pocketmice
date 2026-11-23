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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar
} from '@/components/ui/sidebar';
import { UserMenu } from './UserMenu';

// The frame of the pages that have a sidebar: the sidebar on the left, and the page as a card on its colour.
// What the sidebar holds differs with where the page is (inside a space, or in the settings, which belong to the
// person and to no space), so the frame is given its three parts; the bottom always ends with who is signed in.
// Every piece is the sidebar of shadcn as it comes, at its own sizes.

export function Shell({
  top,
  nav,
  bottom,
  space,
  children
}: {
  /** The top of the sidebar: where the page is, and the way to elsewhere */
  top: ReactNode;
  /** The rows of the sidebar: the pages there are here */
  nav: ReactNode;
  /** Rows at the bottom of the sidebar, above who is signed in */
  bottom?: ReactNode;
  /** The space the page is in, or came from: the settings carry it along, for the way back */
  space: string | undefined;
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
            <UserMenu space={space} />
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
 * count is how many things on that page wait for the person, shown at the end of the row; nothing is shown for 0.
 * On a phone the sidebar is a sheet over the page, and the pages of one frame share it: the row that was tapped
 * closes it, or it would stay over the page it led to.
 */
export function NavRow({
  link,
  icon,
  label,
  active,
  count = 0
}: {
  link: React.ReactElement;
  icon: IconSvgElement;
  label: string;
  active: boolean;
  count?: number;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton render={link} isActive={active} onClick={() => setOpenMobile(false)}>
        <HugeiconsIcon icon={icon} strokeWidth={2} />
        <span>{label}</span>
      </SidebarMenuButton>
      {count > 0 && <SidebarMenuBadge>{count > 99 ? '99+' : count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}
