import type { Theme } from '../../../lib/theme.ts';

/** The sentences of the frame every signed-in page sits in, in English. This file says which sentences there are */
export const en = {
  files: 'Files',
  trash: 'Trash',
  members: 'Members',
  settings: 'Settings',
  account: 'Account',
  apiKeys: 'API keys',
  backToFiles: 'Back to files',
  theme: 'Theme',
  themes: { system: 'System', light: 'Light', dark: 'Dark' } satisfies Record<Theme, string>,
  language: 'Language'
};
