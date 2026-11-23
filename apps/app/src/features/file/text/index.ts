import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of the pages that show files, in the language of this page */
export const fileText = pick({ en, 'zh-hans': zhHans });
