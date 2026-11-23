import { ComputerIcon, Globe02Icon, Logout03Icon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { PersonAvatar } from '@/components/PersonAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { signOut } from '@/features/auth/signOut';
import { authText } from '@/features/auth/text';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { chooseLanguage, language } from '@/lib/language/language';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/lib/language/languages';
import { chooseTheme, THEMES, type Theme, useTheme } from '@/lib/theme';
import { shellText } from './text';

const THEME_ICONS: Record<Theme, IconSvgElement> = { system: ComputerIcon, light: Sun03Icon, dark: Moon02Icon };

/**
 * The bottom of the sidebar: who is signed in, and what is theirs and not a space's: how the page looks, which
 * language it is in, and signing out.
 */
export function UserMenu() {
  const user = useCurrentUser();
  const theme = useTheme();
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger render={<SidebarMenuButton className="h-9 pl-2" />}>
          <PersonAvatar name={user.name} />
          <span className="truncate">{user.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-56">
          <div className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-sm font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={THEME_ICONS[theme]} strokeWidth={2} />
              {shellText.theme}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={(value) => chooseTheme(value as Theme)}>
                {THEMES.map((each) => (
                  <DropdownMenuRadioItem key={each} value={each}>
                    {shellText.themes[each]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} />
            {authText.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
