import { isLanguage, LANGUAGES, type Language } from './languages.ts';

// Which language this page is in. It is decided once, when the page opens, and does not change after: changing the
// language keeps the choice and opens the page anew. So whatever needs a sentence (a component, a constant, a
// function that is no component) holds the sentence itself, and nothing has to follow the language.
// It is the language the person chose here; when they chose none, the one the browser asks for.

/** The language a person chose is kept in the browser under this name. It is not sent to the server */
const STORAGE_KEY = 'pocketmice.language';

/**
 * The one of our languages a browser is asking for. browserLanguages is what the browser reports, the one the
 * person likes best first; the first of them that we have is it. A region is not looked at: en-GB is English, and
 * zh-CN and zh-TW are both Simplified Chinese for now. When none is ours, English.
 */
export function languageOf(browserLanguages: readonly string[]): Language {
  for (const asked of browserLanguages) {
    const base = asked.toLowerCase().split('-')[0];
    const ours = LANGUAGES.find((each) => each.split('-')[0] === base);
    if (ours) return ours;
  }
  return 'en';
}

function chosen(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    // The browser does not let the page keep anything (some private modes): as if none was chosen
    return null;
  }
}

/** The language of this page. Outside a browser (a test runs this file as it is) it is English */
export const language: Language = typeof window === 'undefined' ? 'en' : (chosen() ?? languageOf(navigator.languages));

/** Changes the language to next: the choice is kept, and the page is opened anew in it */
export function chooseLanguage(next: Language): void {
  if (next === language) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // It cannot be kept, so a page opened anew would be in the same language as this one: it is not opened
    return;
  }
  window.location.reload();
}
