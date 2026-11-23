import { pick } from '../language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of the code every page shares, in the language of this page */
export const commonText = pick({ en, 'zh-hans': zhHans });
