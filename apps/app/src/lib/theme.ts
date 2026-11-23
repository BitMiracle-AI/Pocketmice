import { createStore } from './store.ts';

// Whether the page is dark or light. Three things:
// - what the person chose (Theme): follow the system, light, or dark. It is kept in this browser and not sent to
//   the server; "follow the system" is nothing kept. Someone who never chose follows the system.
// - what the system is now, which the browser tells.
// - what the page is now: whether <html> has the class dark, worked out from the two above (isDark). The styles go
//   by that class (the two sets of variables in index.css, and the classes that start with dark:).
//
// The class is set in two places. The moment the page opens, by the few lines in index.html: our code has not
// arrived then, and set any later, someone whose page is dark would see a white one first. After that, by this
// file: the person chose something else, the system changed while they follow it, or they chose in another tab.
// The two places hold the same rule under the same name. This file is the one that counts, and theme.test.ts runs
// the lines of index.html to see that they agree.

export const THEMES = ['system', 'light', 'dark'] as const;

/** What a person can choose */
export type Theme = (typeof THEMES)[number];

/** What the person chose is kept in the browser under this name: light or dark. Nothing kept means system */
export const THEME_STORAGE_KEY = 'pocketmice.theme';

/** Whether the page is dark: when the person chose dark, or follows the system and the system is dark */
export function isDark(chosen: Theme, systemDark: boolean): boolean {
  return chosen === 'dark' || (chosen === 'system' && systemDark);
}

function stored(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    // The browser does not let the page keep anything (some private modes): as if nothing was chosen
    return 'system';
  }
}

// Outside a browser (a test runs this file as it is) there is nothing to follow
const inBrowser = typeof window !== 'undefined';
const theme = createStore<Theme>(inBrowser ? stored() : 'system');

/** Makes the page what it should be by the choice and the system as they are now. Nothing when it already is */
function apply(): void {
  const dark = isDark(theme.get(), window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  if (root.classList.contains('dark') === dark) return;

  // No transitions for the change: they differ in length from place to place, and with them on, one part of the
  // page turns before another. A rule that switches every transition off is added, the class is changed, the
  // browser is made to work the new colours out under that rule, and the rule is taken away again
  const still = document.createElement('style');
  still.textContent = '*,*::before,*::after{transition:none!important}';
  document.head.append(still);
  root.classList.toggle('dark', dark);
  void getComputedStyle(document.body).color;
  setTimeout(() => still.remove(), 1);
}

/**
 * From now on the page follows: the system when it changes, and a choice made in another tab. Called once, when
 * the page opens (main.tsx). What the page is at that moment, index.html has already seen to.
 */
export function followTheme(): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    // A key of null: the other tab emptied the whole storage
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    theme.set(stored());
    apply();
  });
}

/** What the person chose: the one ticked in the menu */
export const useTheme = theme.use;

/** Changes to next. The page follows at once, without being opened again */
export function chooseTheme(next: Theme): void {
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // It cannot be kept: this page does as chosen, and follows the system again when it is opened anew
  }
  theme.set(next);
  apply();
}
