import { ArrowLeft01Icon, Key01Icon } from '@hugeicons/core-free-icons';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from '@/components/ui/sidebar';
import { NavRow, Shell } from './Shell';
import { shellText } from './text';

/**
 * What every page of the settings is inside of. The settings belong to the person and to no space, so the sidebar
 * lists the settings and a way back to the files, in place of a space and what it holds.
 * backTo is the space the person came from, when the address says so: the way back leads there, and to the start
 * when it does not.
 */
export function SettingsShell({ backTo, children }: { backTo: string | undefined; children: ReactNode }) {
  return (
    <Shell
      top={
        <NavRow
          link={backTo ? <Link to="/spaces/$spaceId" params={{ spaceId: backTo }} /> : <Link to="/" />}
          icon={ArrowLeft01Icon}
          label={shellText.backToFiles}
          active={false}
        />
      }
      nav={
        <SidebarGroup>
          <SidebarGroupLabel>{shellText.settings}</SidebarGroupLabel>
          <SidebarMenu>
            {/* The one page of the settings there is, so the page being shown is this one */}
            <NavRow
              link={<Link to="/settings/keys" search={{ space: backTo }} />}
              icon={Key01Icon}
              label={shellText.apiKeys}
              active
            />
          </SidebarMenu>
        </SidebarGroup>
      }
    >
      {children}
    </Shell>
  );
}
