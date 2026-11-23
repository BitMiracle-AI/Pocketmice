import { language } from './language.ts';
import type { Language } from './languages.ts';

// How the words of the pages are written. No component writes a word a person reads: the words of a piece of the
// app are in the text folder next to it, one file for each language (en.ts, zh-hans.ts), and index.ts hands out
// the ones of this page's language.
// The English file says which sentences there are. Every other language is written against its type, so the type
// check reports a sentence that is missing, one that is not asked for, and one that is handed something to fill in
// and does not use it.
// Every language is in the bundle: there are few of them, and their sentences are short.
// A text file is a .ts file and imports with relative paths that end in .ts: a test runs the source as it is, in
// Node, and reads these files too (it gets English).
// A sentence is written one of two ways:
//   as it is                  title: 'Sign in to Pocketmice'
//   with something filled in  sentTo: (email: string) => `We sent a code to ${email}.`
// Not here: the name of the product, and whatever a person or an agent wrote. Neither is translated.

/**
 * Of the sentences of a piece of the app in every language, the ones in the language of this page. Every language
 * on the list has to be given: one that is missing fails the type check.
 */
export function pick<Text>(texts: Record<Language, Text>): Text {
  return texts[language];
}
