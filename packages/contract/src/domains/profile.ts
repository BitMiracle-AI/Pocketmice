import { z } from 'zod';
import { operation } from '../operation.ts';

// The profile: who someone is inside Pocketmice, to themselves and to the people they work with.

/** A name has at most this many characters */
export const PROFILE_NAME_MAX_LENGTH = 50;

/** The name someone goes by. Spaces around it are dropped; it is not empty */
export const profileName = z.string().trim().min(1).max(PROFILE_NAME_MAX_LENGTH);

/**
 * A person's own profile. The email address is not part of the profile: it belongs to the sign-in, and is brought
 * along here for a page to show.
 */
const profile = z.object({
  id: z.string(),
  /** The email address they sign in with */
  email: z.string(),
  /** The name they go by */
  name: z.string()
});

export const getProfile = operation({
  name: 'getProfile',
  description:
    "The caller's own profile: the name they go by and the email address they sign in with. Callers also use " +
    'it to answer "who is signed in"; called with an API key, it says whose key it is.',
  kind: 'read',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({}),
  output: profile,
  errors: []
});

export const updateProfile = operation({
  name: 'updateProfile',
  description:
    "Changes the caller's own profile: the name they go by. Answers with the profile as it is after the " + 'change.',
  kind: 'write',
  access: 'authenticated',
  belongsTo: 'none',
  input: z.object({ name: profileName }),
  output: profile,
  errors: []
});
