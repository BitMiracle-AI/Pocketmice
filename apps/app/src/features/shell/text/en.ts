import type { Theme } from '../../../lib/theme.ts';

/** The sentences of the frame every signed-in page sits in, in English. This file says which sentences there are */
export const en = {
  files: 'Files',
  theme: 'Theme',
  themes: { system: 'System', light: 'Light', dark: 'Dark' } satisfies Record<Theme, string>,
  language: 'Language'
};
