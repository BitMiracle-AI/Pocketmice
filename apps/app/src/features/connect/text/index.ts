import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences of the page that says how to connect an agent, in the language of this page */
export const connectText = pick({ en, 'zh-hans': zhHans });
