import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of the frame every signed-in page sits in, in the language of this page */
export const shellText = pick({ en, 'zh-hans': zhHans });
