import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of the page of the person's account, in the language of this page */
export const profileText = pick({ en, 'zh-hans': zhHans });
