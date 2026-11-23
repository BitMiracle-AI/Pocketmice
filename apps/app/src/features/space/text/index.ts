import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences about spaces, in the language of this page */
export const spaceText = pick({ en, 'zh-hans': zhHans });
