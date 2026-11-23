import { ArrowLeft01Icon, Key01Icon, UserCircleIcon } from '@hugeicons/core-free-icons';
import { Link, useMatchRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from '@/components/ui/sidebar';
import { NavRow, Shell } from './Shell';
import { shellText } from './text';

/**
 * What every page of the settings is inside of. The settings belong to the person and to no space, so the sidebar
 * lists the settings and a way back, in place of a space and what it holds.
 * backTo is the space the person came from, when the address says so: the way back leads to its files, and to the
 * person's spaces when it does not. The address of every page of the settings carries it along.
 */
export function SettingsShell({ backTo, children }: { backTo: string | undefined; children: ReactNode }) {
  const matches = useMatchRoute();
  return (
    <Shell
      space={backTo}
      top={
        backTo ? (
          <NavRow
            link={<Link to="/spaces/$spaceId" params={{ spaceId: backTo }} />}
            icon={ArrowLeft01Icon}
            label={shellText.backToFiles}
            active={false}
          />
        ) : (
          <NavRow link={<Link to="/" />} icon={ArrowLeft01Icon} label={shellText.allSpaces} active={false} />
        )
      }
      nav={
        <SidebarGroup>
          <SidebarGroupLabel>{shellText.settings}</SidebarGroupLabel>
          <SidebarMenu>
            <NavRow
              link={<Link to="/settings/account" search={{ space: backTo }} />}
              icon={UserCircleIcon}
              label={shellText.account}
              active={matches({ to: '/settings/account' }) !== false}
            />
            <NavRow
              link={<Link to="/settings/keys" search={{ space: backTo }} />}
              icon={Key01Icon}
              label={shellText.apiKeys}
              active={matches({ to: '/settings/keys' }) !== false}
            />
          </SidebarMenu>
        </SidebarGroup>
      }
    >
      {children}
    </Shell>
  );
}
