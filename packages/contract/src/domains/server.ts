import { z } from 'zod';
import { operation } from '../operation.ts';

// The server: what a caller can ask about the Pocketmice server it is talking to.

/**
 * Which server this is. Anyone can ask, before anything else is known: a caller that works with several servers,
 * or with a server it does not run itself, uses it to tell which version it is talking to.
 */
export const getServerInfo = operation({
  name: 'getServerInfo',
  kind: 'read',
  access: 'public',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({
    /** The version of the server: three numbers, like 0.1.0 */
    version: z.string().regex(/^\d+\.\d+\.\d+$/)
  }),
  errors: []
});
