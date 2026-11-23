import type { Theme } from '../../../lib/theme.ts';

/** The sentences of the sidebar and of the menu of who is signed in, in English. This file says which sentences there are */
export const en = {
  files: 'Files',
  conversations: 'Conversations',
  search: 'Search',
  trash: 'Trash',
  members: 'Members',
  settings: 'Settings',
  account: 'Account',
  apiKeys: 'API keys',
  backToFiles: 'Back to files',
  allSpaces: 'All spaces',
  userMenu: 'Your account',
  theme: 'Theme',
  themes: { system: 'System', light: 'Light', dark: 'Dark' } satisfies Record<Theme, string>,
  language: 'Language'
};
