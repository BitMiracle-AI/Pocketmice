import { getServerInfo } from '@pocketmice/contract/domains/server';
import { readQuery } from '@/lib/api';

/**
 * Which server this is, and with it how people sign in to it: with a code sent to their address, or with a
 * password. A server has one of the two and never both, so the sign-in page asks before it shows a form.
 */
export const serverInfoQuery = readQuery(getServerInfo, {});
