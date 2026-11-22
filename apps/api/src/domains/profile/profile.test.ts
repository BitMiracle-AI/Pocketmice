import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getProfile, updateProfile } from '@pocketmice/contract/domains/profile';
import { users } from '@pocketmice/db/schema/auth';
import { profiles } from '@pocketmice/db/schema/profile';
import { eq } from 'drizzle-orm';
import { useTestApi } from '../testing.ts';
import { ensureProfile } from './ensureProfile.ts';

const api = useTestApi();

test('getProfile answers with the caller: their id, their email address and the name they signed up under', async () => {
  const ada = await api.addPerson('Ada');
  await api.addPerson('Grace');

  const result = await api.as(ada)(getProfile, {});

  assert.deepEqual(result, { ok: true, data: { id: ada.id, email: ada.email, name: 'Ada' } });
});

test('getProfile and updateProfile signed out are UNAUTHENTICATED', async () => {
  const read = await api.as(null)(getProfile, {});
  const written = await api.as(null)(updateProfile, { name: 'Nobody' });

  assert.equal(!read.ok && read.code, 'UNAUTHENTICATED');
  assert.equal(!written.ok && written.code, 'UNAUTHENTICATED');
});

test('updateProfile changes the name the caller goes by, trimmed, and answers with the profile as it is now', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');

  assert.deepEqual(await api.as(ada)(updateProfile, { name: '  Ada Lovelace ' }), {
    ok: true,
    data: { id: ada.id, email: ada.email, name: 'Ada Lovelace' }
  });

  const mine = await api.as(ada)(getProfile, {});
  assert.equal(mine.ok && mine.data.name, 'Ada Lovelace');
  // Nobody else's name moved
  const theirs = await api.as(grace)(getProfile, {});
  assert.equal(theirs.ok && theirs.data.name, 'Grace');
  // The name in the sign-in library's table is what was typed at sign-up, and stays that
  assert.deepEqual(await api.db.select({ name: users.name }).from(users).where(eq(users.id, ada.id)), [
    { name: 'Ada' }
  ]);
});

test('updateProfile refuses a name that is empty or too long, and keeps the old one', async () => {
  const ada = await api.addPerson('Ada');

  for (const name of ['', '   ', 'a'.repeat(51)]) {
    const result = await api.as(ada)(updateProfile, { name });
    assert.equal(!result.ok && result.code, 'INVALID_INPUT', `"${name.slice(0, 10)}" should be refused`);
  }

  const mine = await api.as(ada)(getProfile, {});
  assert.equal(mine.ok && mine.data.name, 'Ada');
});

test('making sure of the profile again leaves it as it is, also when two sign-ins arrive together', async () => {
  const ada = await api.addPerson('Ada');
  await api.as(ada)(updateProfile, { name: 'Ada Lovelace' });

  await Promise.all([ensureProfile(api.db, ada.id), ensureProfile(api.db, ada.id)]);
  await ensureProfile(api.db, ada.id);

  assert.deepEqual(await api.db.select({ name: profiles.name }).from(profiles).where(eq(profiles.id, ada.id)), [
    { name: 'Ada Lovelace' }
  ]);
});

test('the profile goes when the user is deleted', async () => {
  const ada = await api.addPerson('Ada');

  await api.db.delete(users).where(eq(users.id, ada.id));

  assert.equal((await api.db.select().from(profiles).where(eq(profiles.id, ada.id))).length, 0);
});

test('someone signed in without a profile is our mistake: an internal error, reported, and no profile is made on the quiet', async () => {
  // A user row with nothing made ready for it: what a sign-in can never leave behind
  const [user] = await api.db
    .insert(users)
    .values({ name: 'Ada', email: 'no-profile@example.com' })
    .returning({ id: users.id, email: users.email });
  assert.ok(user);

  for (const result of [await api.as(user)(getProfile, {}), await api.as(user)(updateProfile, { name: 'Ada' })]) {
    assert.equal(!result.ok && result.code, 'INTERNAL');
  }

  const reported = api.takeReported();
  assert.deepEqual(
    reported.map(({ where }) => where),
    ['getProfile', 'updateProfile']
  );
  assert.match(String(reported[0]?.error), /is signed in but has no profile/);
  assert.equal((await api.db.select().from(profiles).where(eq(profiles.id, user.id))).length, 0);
});
