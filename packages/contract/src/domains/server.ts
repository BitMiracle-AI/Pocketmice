import { z } from 'zod';
import { operation } from '../operation.ts';
import { signInMethod } from './auth.ts';

// The server: what a caller can ask about the Pocketmice server it is talking to.

export const getServerInfo = operation({
  name: 'getServerInfo',
  description:
    'Which server this is: its version, and how people sign in to it. Anyone can ask, before anything else is ' +
    'known: a caller that works with several servers, or with a server it does not run itself, uses it to tell ' +
    'which version it is talking to; and a page asks it how people sign in here before it shows them a form.',
  kind: 'read',
  access: 'public',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({
    /** The version of the server: three numbers, like 0.1.0 */
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    /** How people sign in to this server: one of the two ways, never both (see domains/auth.ts) */
    signInMethod
  }),
  errors: []
});
