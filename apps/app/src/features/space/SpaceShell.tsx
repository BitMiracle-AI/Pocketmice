import {
  ArrowLeft01Icon,
  BubbleChatIcon,
  Delete02Icon,
  Folder01Icon,
  Key01Icon,
  Settings01Icon,
  UserMultiple02Icon
} from '@hugeicons/core-free-icons';
import { Link, useMatchRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useUnreadTotal } from '@/features/conversation/conversations';
import { useSpaceEvents } from '@/features/event/useSpaceEvents';
import { FilesLink } from '@/features/file/FilesLink';
import { NavRow, Shell } from '@/features/shell/Shell';
import { shellText } from '@/features/shell/text';
import { CurrentSpaceProvider } from './CurrentSpaceProvider';
import { SpaceMark } from './SpaceMark';
import { type Space, useSpaces } from './spaces';
import { spaceText } from './text';
import { UnknownSpacePage } from './UnknownSpacePage';

/**
 * What every page of a space is inside of: the frame with the sidebar of that space, and the space itself handed
 * down to the page (useCurrentSpace). spaceId is the one in the address.
 * When the person is not in that space, or is no longer (they were removed while the page was open, and the list
 * of spaces was read again), it says so in place of the page.
 * While it is shown, what happens in the space is heard as it happens, whichever page of the space is open: the
 * sidebar says how many messages the person has not read.
 */
export function SpaceShell({ spaceId, children }: { spaceId: string; children: ReactNode }) {
  const space = useSpaces().find((each) => each.id === spaceId);
  if (!space) return <UnknownSpacePage />;
  return <SpaceFrame space={space}>{children}</SpaceFrame>;
}

function SpaceFrame({ space, children }: { space: Space; children: ReactNode }) {
  const spaceId = space.id;
  const matches = useMatchRoute();
  const unread = useUnreadTotal(spaceId);
  useSpaceEvents(spaceId);
  // Which row of the sidebar the page is on is read from the address: the conversations, the members, the trash,
  // the settings, or else the files
  const onConversations = matches({ to: '/spaces/$spaceId/conversations', fuzzy: true }) !== false;
  const onMembers = matches({ to: '/spaces/$spaceId/members' }) !== false;
  const onTrash = matches({ to: '/spaces/$spaceId/trash' }) !== false;
  const onSettings = matches({ to: '/spaces/$spaceId/settings' }) !== false;

  return (
    <CurrentSpaceProvider space={space}>
      <Shell
        space={spaceId}
        // Which space this is: another one is gone to from the start, where all of them are
        mark={<SpaceMark name={space.name} />}
        title={space.name}
        subtitle={spaceText.roles[space.role]}
        home={<Link to="/spaces/$spaceId" params={{ spaceId }} />}
        nav={
          <>
            <NavRow
              link={<FilesLink spaceId={spaceId} fileId={null} />}
              icon={Folder01Icon}
              label={shellText.files}
              active={!onConversations && !onMembers && !onTrash && !onSettings}
            />
            <NavRow
              link={<Link to="/spaces/$spaceId/conversations" params={{ spaceId }} />}
              icon={BubbleChatIcon}
              label={shellText.conversations}
              active={onConversations}
              count={unread}
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
            {/* What the settings of a space hold is the owner's alone */}
            {space.role === 'owner' && (
              <NavRow
                link={<Link to="/spaces/$spaceId/settings" params={{ spaceId }} />}
                icon={Settings01Icon}
                label={shellText.settings}
                active={onSettings}
              />
            )}
          </>
        }
        // The other spaces, and the keys: the keys are the person's and not this space's, and the address says
        // which space the person came from, for the way back
        ways={
          <>
            <NavRow link={<Link to="/" />} icon={ArrowLeft01Icon} label={shellText.allSpaces} small />
            <NavRow
              link={<Link to="/settings/keys" search={{ space: spaceId }} />}
              icon={Key01Icon}
              label={shellText.apiKeys}
              small
            />
          </>
        }
      >
        {children}
      </Shell>
    </CurrentSpaceProvider>
  );
}
