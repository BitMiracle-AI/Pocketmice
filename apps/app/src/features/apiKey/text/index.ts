import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of the page of API keys, in the language of this page */
export const apiKeyText = pick({ en, 'zh-hans': zhHans });
