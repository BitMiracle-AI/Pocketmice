import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of the uploads, in the language of this page */
export const uploadText = pick({ en, 'zh-hans': zhHans });
