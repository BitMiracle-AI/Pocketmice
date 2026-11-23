import { Delete02Icon, Folder01Icon, Key01Icon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Link, useMatchRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SidebarGroup, SidebarMenu } from '@/components/ui/sidebar';
import { NavRow, Shell } from '@/features/shell/Shell';
import { shellText } from '@/features/shell/text';
import { CurrentSpaceProvider } from './CurrentSpaceProvider';
import { SpaceSwitch } from './SpaceSwitch';
import { useSpaces } from './spaces';
import { UnknownSpacePage } from './UnknownSpacePage';

/**
 * What every page of a space is inside of: the frame with the sidebar of that space, and the space itself handed
 * down to the page (useCurrentSpace). spaceId is the one in the address.
 * When the person is not in that space, or is no longer (they were removed while the page was open, and the list
 * of spaces was read again), it says so in place of the page.
 */
export function SpaceShell({ spaceId, children }: { spaceId: string; children: ReactNode }) {
  const space = useSpaces().find((each) => each.id === spaceId);
  const matches = useMatchRoute();
  if (!space) return <UnknownSpacePage />;
  // Which row of the sidebar the page is on is read from the address: the members, the trash, or else the files
  const onMembers = matches({ to: '/spaces/$spaceId/members' }) !== false;
  const onTrash = matches({ to: '/spaces/$spaceId/trash' }) !== false;

  return (
    <CurrentSpaceProvider space={space}>
      <Shell
        top={<SpaceSwitch />}
        // The keys are the person's and not this space's, so the way to them is at the bottom, next to who is
        // signed in. The address says which space the person came from, for the way back
        bottom={
          <NavRow
            link={<Link to="/settings/keys" search={{ space: spaceId }} />}
            icon={Key01Icon}
            label={shellText.apiKeys}
            active={false}
          />
        }
        nav={
          <SidebarGroup>
            <SidebarMenu>
              <NavRow
                link={<Link to="/spaces/$spaceId" params={{ spaceId }} />}
                icon={Folder01Icon}
                label={shellText.files}
                active={!onMembers && !onTrash}
              />
              <NavRow
                link={<Link to="/spaces/$spaceId/members" params={{ spaceId }} />}
                icon={UserMultiple02Icon}
                label={shellText.members}
                active={onMembers}
              />
              <NavRow
                link={<Link to="/spaces/$spaceId/trash" params={{ spaceId }} />}
                icon={Delete02Icon}
                label={shellText.trash}
                active={onTrash}
              />
            </SidebarMenu>
          </SidebarGroup>
        }
      >
        {children}
      </Shell>
    </CurrentSpaceProvider>
  );
}
