import { ArrowLeft01Icon, Key01Icon, Robot01Icon, Settings01Icon, UserCircleIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link, useMatchRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { NavRow, Shell } from './Shell';
import { shellText } from './text';

/**
 * What every page of the settings is inside of. The settings belong to the person and to no space, so the sidebar
 * lists the settings, and at its bottom has the way back, in place of a space and what it holds.
 * backTo is the space the person came from, when the address says so: the way back leads to its files, and to the
 * person's spaces when it does not. The address of every page of the settings carries it along.
 */
export function SettingsShell({ backTo, children }: { backTo: string | undefined; children: ReactNode }) {
  const matches = useMatchRoute();
  return (
    <Shell
      space={backTo}
      mark={
        <div
          aria-hidden="true"
          className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} className="size-4" />
        </div>
      }
      title={shellText.settings}
      subtitle={shellText.yours}
      home={<Link to="/settings/account" search={{ space: backTo }} />}
      nav={
        <>
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
          <NavRow
            link={<Link to="/settings/connect" search={{ space: backTo }} />}
            icon={Robot01Icon}
            label={shellText.connect}
            active={matches({ to: '/settings/connect' }) !== false}
          />
        </>
      }
      ways={
        backTo ? (
          <NavRow
            link={<Link to="/spaces/$spaceId" params={{ spaceId: backTo }} />}
            icon={ArrowLeft01Icon}
            label={shellText.backToFiles}
            small
          />
        ) : (
          <NavRow link={<Link to="/" />} icon={ArrowLeft01Icon} label={shellText.allSpaces} small />
        )
      }
    >
      {children}
    </Shell>
  );
}
