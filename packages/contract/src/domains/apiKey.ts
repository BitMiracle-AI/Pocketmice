import { z } from 'zod';
import { id } from '../id.ts';
import { operation } from '../operation.ts';

// API keys: how an agent calls the api.
// An agent is not a user. It calls with a key that a person made, and what it does is done as that person: in the
// spaces that person is in, in the role they have there. A key only ever narrows that:
// - a key whose permission is read calls reads only;
// - no key calls an operation whose access is session (see operation.ts).
// A key is sent with every request in the Authorization header, as a bearer token.
// The person who made a key can see the key itself again whenever they are signed in, to copy it once more. Only
// they can: the operations on keys are for the person themselves, so no key reads a key.
// A key that was deleted stops working for good, and is not listed any more.

/** What a key may do: read is reads only; write is reads and writes */
export const API_KEY_PERMISSIONS = ['read', 'write'] as const;

export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export const apiKeyPermission = z.enum(API_KEY_PERMISSIONS);

/** The name of a key has at most this many characters */
export const API_KEY_NAME_MAX_LENGTH = 50;

/** What the person calls the key, to tell their keys apart. Spaces around it are dropped; it is not empty */
export const apiKeyName = z.string().trim().min(1).max(API_KEY_NAME_MAX_LENGTH);

/** Every key starts with this, so a key that turns up where it should not be is recognised as one */
export const API_KEY_PREFIX = 'pm_';

/** The Authorization header of a request sent with this key */
export function apiKeyAuthorization(key: string): string {
  return `Bearer ${key}`;
}

/** The bearer token in an Authorization header. Null when there is no header, or it holds something else */
export function bearerToken(authorization: string | null | undefined): string | null {
  return /^Bearer +(\S+)$/i.exec(authorization ?? '')?.[1] ?? null;
}

/** A key, as the person who made it sees it */
const apiKey = z.object({
  id: z.string(),
  name: z.string(),
  permission: apiKeyPermission,
  /** The key itself: what a request is sent with */
  key: z.string(),
  /** When it was made: an ISO 8601 time in UTC */
  createdAt: z.iso.datetime()
});

export const createApiKey = operation({
  name: 'createApiKey',
  description: 'Makes an API key for the caller. Answers with it, the key itself included.',
  kind: 'write',
  access: 'session',
  belongsTo: 'none',
  input: z.object({ name: apiKeyName, permission: apiKeyPermission }),
  output: z.object({ apiKey }),
  errors: []
});

export const getApiKeys = operation({
  name: 'getApiKeys',
  description:
    "The caller's API keys that work, the oldest first, each with the key itself. A key that was deleted is " +
    'not among them.',
  kind: 'read',
  access: 'session',
  belongsTo: 'none',
  input: z.object({}),
  output: z.object({ apiKeys: z.array(apiKey) }),
  errors: []
});

export const deleteApiKey = operation({
  name: 'deleteApiKey',
  description:
    "Deletes one of the caller's API keys: from then on a request sent with it is from nobody, and nothing " +
    'brings the key back. NOT_FOUND: the caller has no such key, or deleted it before.',
  kind: 'write',
  access: 'session',
  belongsTo: 'none',
  input: z.object({ apiKeyId: id }),
  output: z.object({}),
  errors: ['NOT_FOUND']
});
