import { LANGUAGES, type Language } from './languages.ts';

// Which language this page is in. It is decided once, when the page opens, and does not change after: so whatever
// needs a sentence (a component, a constant, a function that is no component) holds the sentence itself, and
// nothing has to follow the language.
// It is the language the browser asks for.

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

/** The language of this page. Outside a browser (a test runs this file as it is) it is English */
export const language: Language = typeof window === 'undefined' ? 'en' : languageOf(navigator.languages);
