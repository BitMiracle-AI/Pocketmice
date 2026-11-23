import { pick } from '../../../lib/language/text.ts';
import { en } from './en.ts';
import { zhHans } from './zh-hans.ts';

/** The sentences about invites, in the language of this page */
export const inviteText = pick({ en, 'zh-hans': zhHans });
