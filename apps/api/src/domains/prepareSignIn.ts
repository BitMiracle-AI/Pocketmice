import type { Db } from '@pocketmice/db';
import { ensureProfile } from './profile/ensureProfile.ts';

/**
 * Makes ready what every signed-in person must have: today, their profile.
 * It runs every time a session is started, before the cookie is handed over (see prepareSignIn in
 * domains/auth/auth.ts). If one of the things cannot be made ready, the sign-in fails.
 * Each thing is made only when it is missing, so signing in again after a failure picks up where it stopped.
 * A domain that has such a thing adds it here.
 */
export async function prepareSignIn(db: Db, userId: string): Promise<void> {
  await ensureProfile(db, userId);
}
