import type { IconSvgElement } from '@hugeicons/react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ReactNode } from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar
} from '@/components/ui/sidebar';
import { UploadPanel } from '@/features/upload/UploadPanel';
import { useUploads } from '@/features/upload/uploads';
import { useIsMobile } from '@/hooks/useIsMobile';
import { UserMenu } from './UserMenu';

// The frame of the pages that have a sidebar: shadcn's inset sidebar on the left, and the page as a card next to
// it. What the sidebar holds differs with where the page is (inside a space, or in the settings, which are the
// person's and no space's), so the frame is handed its parts: what is at its top (where the page is), its rows
// (the pages there are here), and the small rows at its bottom (the ways out of here). It always ends with the
// uploads that are going, while there are any, and with who is signed in.

export function Shell({
  mark,
  title,
  subtitle,
  home,
  nav,
  ways,
  space,
  children
}: {
  /** What stands for where the page is, at the top of the sidebar: the square of a space, or an icon */
  mark: ReactNode;
  /** What that place is called, and the line under it */
  title: string;
  subtitle: string;
  /** The link the top of the sidebar is, with nothing in it: to the first page of this place */
  home: React.ReactElement;
  /** The rows of the sidebar: the pages there are here */
  nav: ReactNode;
  /** The small rows at the bottom of the sidebar: the ways out of here */
  ways: ReactNode;
  /** The space the page is in, or came from: the settings carry it along, for the way back */
  space: string | undefined;
  /** The page */
  children: ReactNode;
}) {
  return (
    // As high as the window and no higher: a page scrolls inside the card, and the sidebar stays where it is
    <SidebarProvider className="h-svh">
      <Sidebar variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <Head mark={mark} title={title} subtitle={subtitle} home={home} />
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{nav}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>{ways}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <UploadsRow />
            <UserMenu space={space} />
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  );
}

/** The top of the sidebar: where the page is. It leads to the first page of that place */
function Head({
  mark,
  title,
  subtitle,
  home
}: {
  mark: ReactNode;
  title: string;
  subtitle: string;
  home: React.ReactElement;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton size="lg" render={home} onClick={() => setOpenMobile(false)}>
        {mark}
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{title}</span>
          <span className="truncate text-xs">{subtitle}</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The uploads in hand, as a row of the sidebar that opens the list of them. No row when there is none */
function UploadsRow() {
  const uploads = useUploads();
  const isMobile = useIsMobile();
  if (uploads.length === 0) return null;
  return (
    <SidebarMenuItem>
      <UploadPanel render={<SidebarMenuButton />} side={isMobile ? 'top' : 'right'} />
    </SidebarMenuItem>
  );
}

/**
 * A row of the sidebar that leads to a page. link is the link itself, with nothing in it (a Link of the router
 * with its address): the row puts the icon and the label inside. active says the page being shown is this one.
 * count is how many things on that page wait for the person, shown at the end of the row; nothing is shown for 0.
 * small is for the ways out at the bottom of the sidebar.
 * On a phone the sidebar is a sheet over the page, and the pages of one frame share it: the row that was tapped
 * closes it, or it would stay over the page it led to.
 */
export function NavRow({
  link,
  icon,
  label,
  active = false,
  count = 0,
  small = false
}: {
  link: React.ReactElement;
  icon: IconSvgElement;
  label: string;
  active?: boolean;
  count?: number;
  small?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={link}
        size={small ? 'sm' : 'default'}
        isActive={active}
        onClick={() => setOpenMobile(false)}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} />
        <span>{label}</span>
      </SidebarMenuButton>
      {count > 0 && <SidebarMenuBadge>{count > 99 ? '99+' : count}</SidebarMenuBadge>}
    </SidebarMenuItem>
  );
}
