// The languages the pages are written in: listed here once.
// A language is named in lowercase, and Chinese by its script (zh-hans): the file that holds the sentences of a
// language has this name too.
// To add a language: add it here; give every text folder a file for it and hand that file to pick in the folder's
// index.ts (the type check reports a folder that was missed); see languageOf in language.ts for which browsers get
// it; and give it its typeface in the :lang() part of index.css.
export const LANGUAGES = ['en', 'zh-hans'] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * What each language is called in its own words. The menu that changes the language shows these: someone who
 * cannot read the language the page is in still finds theirs.
 */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', 'zh-hans': '简体中文' };

export function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * The language as the standards write it: zh-hans becomes zh-Hans. It is what goes into <html lang>, and what
 * numbers and dates are written by (Intl).
 */
export function languageTag(language: Language): string {
  return Intl.getCanonicalLocales(language)[0] ?? language;
}
