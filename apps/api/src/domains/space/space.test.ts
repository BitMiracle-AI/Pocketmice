import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpace, getSpaces } from '@pocketmice/contract/domains/space';
import { users } from '@pocketmice/db/schema/auth';
import { spaceMembers, spaces } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';
import { findMembership } from './findMembership.ts';

const api = useTestApi();

/** Makes a space as this person and returns it */
async function make(person: CurrentUser, name: string) {
  const result = await api.as(person)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space;
}

test('someone who has made no space and joined none is in none', async () => {
  const ada = await api.addPerson('Ada');

  assert.deepEqual(await api.as(ada)(getSpaces, {}), { ok: true, data: { spaces: [] } });
});

test('createSpace makes a space under the name, trimmed; the caller is its owner and its only member', async () => {
  const ada = await api.addPerson('Ada');

  const result = await api.as(ada)(createSpace, { name: '  Research notes ' });

  assert.ok(result.ok);
  const { space } = result.data;
  assert.equal(space.name, 'Research notes');
  assert.deepEqual(
    await api.db.select({ name: spaces.name, userId: spaces.userId }).from(spaces).where(eq(spaces.id, space.id)),
    [{ name: 'Research notes', userId: ada.id }]
  );
  assert.deepEqual(
    await api.db
      .select({ userId: spaceMembers.userId, role: spaceMembers.role })
      .from(spaceMembers)
      .where(eq(spaceMembers.spaceId, space.id)),
    [{ userId: ada.id, role: 'owner' }]
  );
  assert.deepEqual(await findMembership(api.db, space.id, ada.id), { role: 'owner' });
});

test('getSpaces lists the spaces the caller is in, the oldest first, and none of anyone else', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const first = await make(ada, 'Research notes');
  const theirs = await make(grace, 'Reports');
  // Two spaces may have the same name
  const second = await make(ada, 'Research notes');
  assert.notEqual(first.id, second.id);

  assert.deepEqual(await api.as(ada)(getSpaces, {}), { ok: true, data: { spaces: [first, second] } });
  assert.deepEqual(await api.as(grace)(getSpaces, {}), { ok: true, data: { spaces: [theirs] } });
});

test('a space does not exist for someone who is not a member, nor when there is no such space', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const space = await make(ada, 'Research notes');

  assert.equal(await findMembership(api.db, space.id, grace.id), null);
  assert.equal(await findMembership(api.db, NOBODY, ada.id), null);
});

test('createSpace refuses a name that is empty or too long, and makes nothing', async () => {
  const ada = await api.addPerson('Ada');

  for (const name of ['', '   ', 'a'.repeat(51)]) {
    const result = await api.as(ada)(createSpace, { name });
    assert.equal(!result.ok && result.code, 'INVALID_INPUT', `"${name.slice(0, 10)}" should be refused`);
  }

  assert.equal((await api.db.select().from(spaces).where(eq(spaces.userId, ada.id))).length, 0);
});

test('getSpaces and createSpace signed out are UNAUTHENTICATED', async () => {
  const read = await api.as(null)(getSpaces, {});
  const written = await api.as(null)(createSpace, { name: 'Research notes' });

  assert.equal(!read.ok && read.code, 'UNAUTHENTICATED');
  assert.equal(!written.ok && written.code, 'UNAUTHENTICATED');
});

test('the database refuses a second owner in one space', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const space = await make(ada, 'Research notes');

  await assert.rejects(api.db.insert(spaceMembers).values({ spaceId: space.id, userId: grace.id, role: 'owner' }));
});

test('the database refuses to delete a user who made a space', async () => {
  const ada = await api.addPerson('Ada');
  await make(ada, 'Research notes');

  await assert.rejects(api.db.delete(users).where(eq(users.id, ada.id)));
});
