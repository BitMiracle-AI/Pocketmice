import { Globe02Icon, Logout03Icon, Settings01Icon, UnfoldMoreIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Link } from '@tanstack/react-router';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { signOut } from '@/features/auth/signOut';
import { authText } from '@/features/auth/text';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useIsMobile } from '@/hooks/useIsMobile';
import { chooseLanguage, language } from '@/lib/language/language';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/lib/language/languages';
import { shellText } from './text';

/** Who is signed in, the way the sidebar and the menu both write it: their avatar, their name, their address */
function Who() {
  const user = useCurrentUser();
  return (
    <>
      <PersonAvatar id={user.id} name={user.name} />
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-semibold">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
    </>
  );
}

/**
 * The bottom of the sidebar: who is signed in, and what is theirs and not a space's: their settings, how the page
 * looks, which language it is in, and signing out.
 * space is the space the page is in, or came from: the settings carry it along, for the way back.
 */
export function UserMenu({ space }: { space: string | undefined }) {
  const isMobile = useIsMobile();
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton size="lg" aria-label={shellText.userMenu} />}>
          <Who />
          <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="ml-auto size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" className="min-w-56">
          <UserMenuItems space={space} />
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

/** The same menu on a page with no sidebar: the person's avatar, in the corner of the page, opens it */
export function UserButton() {
  const user = useCurrentUser();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={shellText.userMenu} />}>
        <PersonAvatar id={user.id} name={user.name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <UserMenuItems space={undefined} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What the menu holds, whichever button opens it */
function UserMenuItems({ space }: { space: string | undefined }) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center gap-2 font-normal">
          <Who />
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuGroup>
        <DropdownMenuItem render={<Link to="/settings/account" search={{ space }} />}>
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
          {shellText.settings}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} />
            {shellText.language}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={language} onValueChange={(value) => chooseLanguage(value as Language)}>
              {LANGUAGES.map((each) => (
                <DropdownMenuRadioItem key={each} value={each}>
                  {LANGUAGE_NAMES[each]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
      <DropdownMenuItem onClick={signOut}>
        <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
        {authText.signOut}
      </DropdownMenuItem>
    </>
  );
}
