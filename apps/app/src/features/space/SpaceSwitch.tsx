import { Add01Icon, Tick02Icon, UnfoldMoreIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useCurrentSpace } from './CurrentSpaceProvider';
import { NewSpaceDialog } from './NewSpaceDialog';
import { SpaceMark } from './SpaceMark';
import { useSpaces } from './spaces';
import { spaceText } from './text';

/**
 * The top of the sidebar inside a space: which space this is, and the way to another one or to a new one.
 * Going to a space is going to its address: the space the page is in is not kept anywhere else.
 */
export function SpaceSwitch() {
  const space = useCurrentSpace();
  const spaces = useSpaces();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton aria-label={spaceText.switchSpace} className="font-medium" />}>
          <SpaceMark name={space.name} />
          <span className="truncate">{space.name}</span>
          <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="ml-auto text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{spaceText.listLabel}</DropdownMenuLabel>
            {spaces.map((each) => (
              <DropdownMenuItem
                key={each.id}
                onClick={() => navigate({ to: '/spaces/$spaceId', params: { spaceId: each.id } })}
              >
                <SpaceMark name={each.name} />
                <span className="min-w-0 flex-1 truncate">{each.name}</span>
                <span className="text-xs text-muted-foreground">{spaceText.roles[each.role]}</span>
                <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className={cn(each.id !== space.id && 'invisible')} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            {spaceText.newSpace}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewSpaceDialog open={creating} onOpenChange={setCreating} />
    </SidebarMenuItem>
  );
}
