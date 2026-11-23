import { PROFILE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/profile';
import type { Db } from '@pocketmice/db';
import { users } from '@pocketmice/db/schema/auth';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq } from 'drizzle-orm';

/**
 * Makes sure this person has a profile. Without one, it is made, and its name is the name they gave at sign-up.
 * Someone who signed up with a code was asked for none: their name is the part of their email address before the
 * @, cut to the length a name may have, until they change it.
 * With one, nothing happens: the name in a profile that exists is never overwritten from here.
 * It runs every time a session is started, before the cookie is handed over (see domains/prepareSignIn.ts), and
 * when it fails the sign-in fails. So whoever is signed in has a profile: code that reads a profile does not handle
 * "none", and does not make one while reading.
 * Two sign-ins of one person arriving together are fine: the later one finds the profile there and does nothing.
 */
export async function ensureProfile(db: Db, userId: string): Promise<void> {
  const [user] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId));
  if (!user) throw new Error(`Cannot make a profile for user ${userId}: there is no such user.`);

  const [beforeAt = ''] = user.email.split('@');
  const name = user.name || beforeAt.slice(0, PROFILE_NAME_MAX_LENGTH);
  await db.insert(profiles).values({ id: userId, name }).onConflictDoNothing();
}
