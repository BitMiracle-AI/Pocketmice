import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of signing in, signing up and signing out, in the language of this page */
export const authText = pick({ en, 'zh-hans': zhHans });
