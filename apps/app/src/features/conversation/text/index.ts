import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences about conversations, in the language of this page */
export const conversationText = pick({ en, 'zh-hans': zhHans });
