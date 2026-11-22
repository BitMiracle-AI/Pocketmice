import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSpace,
  getMembers,
  getSpaces,
  leaveSpace,
  removeMember,
  updateMember
} from '@pocketmice/contract/domains/space';
import { spaceMembers } from '@pocketmice/db/schema/space';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

/** Makes a space as this person and returns its id */
async function make(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/**
 * Puts this person into the space in this role, by writing the row. How someone really gets in, with an invite, is
 * tested in domains/invite/invite.test.ts
 */
async function add(spaceId: string, person: CurrentUser, role: 'editor' | 'viewer') {
  await api.db.insert(spaceMembers).values({ spaceId, userId: person.id, role });
}

/** The members of the space as its owner sees them, or the error code */
async function membersOf(spaceId: string, asPerson: CurrentUser) {
  const result = await api.as(asPerson)(getMembers, { spaceId });
  return result.ok ? result.data.members : result.code;
}

test('getMembers lists who is in the space with their name and role, in the order they became members; any member may ask', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await make(ada);
  await add(spaceId, grace, 'editor');
  await add(spaceId, linus, 'viewer');

  const expected = [
    { userId: ada.id, name: 'Ada', role: 'owner' },
    { userId: grace.id, name: 'Grace', role: 'editor' },
    { userId: linus.id, name: 'Linus', role: 'viewer' }
  ];
  // Nothing else about a member is told: no email address
  assert.deepEqual(await membersOf(spaceId, ada), expected);
  assert.deepEqual(await membersOf(spaceId, linus), expected);
});

test('the members of a space are not told to someone who is not in it', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await make(ada);

  assert.equal(await membersOf(spaceId, grace), 'UNKNOWN_SPACE');
  assert.equal(await membersOf(NOBODY, ada), 'UNKNOWN_SPACE');
});

test('getSpaces tells the caller their own role in each space', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const hers = await make(grace, 'Reports');
  const mine = await make(ada, 'Research notes');
  await add(hers, ada, 'viewer');

  assert.deepEqual(await api.as(ada)(getSpaces, {}), {
    ok: true,
    data: {
      spaces: [
        { id: hers, name: 'Reports', role: 'viewer' },
        { id: mine, name: 'Research notes', role: 'owner' }
      ]
    }
  });
});

test('updateMember changes the role of a member and answers with the member as they are now', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await make(ada);
  await add(spaceId, grace, 'editor');

  assert.deepEqual(await api.as(ada)(updateMember, { spaceId, userId: grace.id, role: 'viewer' }), {
    ok: true,
    data: { member: { userId: grace.id, name: 'Grace', role: 'viewer' } }
  });

  assert.deepEqual(await membersOf(spaceId, grace), [
    { userId: ada.id, name: 'Ada', role: 'owner' },
    { userId: grace.id, name: 'Grace', role: 'viewer' }
  ]);
});

test('the role of the owner does not change, and nobody is made an owner', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await make(ada);
  await add(spaceId, grace, 'editor');

  const own = await api.as(ada)(updateMember, { spaceId, userId: ada.id, role: 'editor' });
  assert.equal(!own.ok && own.code, 'CONFLICT');

  // @ts-expect-error -- owner is not a role that can be given
  const promoted = await api.as(ada)(updateMember, { spaceId, userId: grace.id, role: 'owner' });
  assert.equal(!promoted.ok && promoted.code, 'INVALID_INPUT');

  assert.deepEqual(await membersOf(spaceId, ada), [
    { userId: ada.id, name: 'Ada', role: 'owner' },
    { userId: grace.id, name: 'Grace', role: 'editor' }
  ]);
});

test('removeMember takes a member out: the space no longer exists for them', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await make(ada);
  await add(spaceId, grace, 'editor');

  assert.deepEqual(await api.as(ada)(removeMember, { spaceId, userId: grace.id }), { ok: true, data: {} });

  assert.equal(await membersOf(spaceId, grace), 'UNKNOWN_SPACE');
  assert.deepEqual(await api.as(grace)(getSpaces, {}), { ok: true, data: { spaces: [] } });
  assert.deepEqual(await membersOf(spaceId, ada), [{ userId: ada.id, name: 'Ada', role: 'owner' }]);
});

test('the owner cannot be removed, and cannot leave', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await make(ada);

  const removed = await api.as(ada)(removeMember, { spaceId, userId: ada.id });
  const left = await api.as(ada)(leaveSpace, { spaceId });

  assert.equal(!removed.ok && removed.code, 'CONFLICT');
  assert.equal(!left.ok && left.code, 'CONFLICT');
  assert.deepEqual(await membersOf(spaceId, ada), [{ userId: ada.id, name: 'Ada', role: 'owner' }]);
});

test('changing or removing someone who is not a member of this space is NOT_FOUND, and touches no other space', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const mine = await make(ada);
  // Linus is an editor of somebody else's space, not of Ada's
  const hers = await make(grace, 'Reports');
  await add(hers, linus, 'editor');

  for (const userId of [linus.id, NOBODY]) {
    const updated = await api.as(ada)(updateMember, { spaceId: mine, userId, role: 'viewer' });
    const removed = await api.as(ada)(removeMember, { spaceId: mine, userId });

    assert.equal(!updated.ok && updated.code, 'NOT_FOUND');
    assert.equal(!removed.ok && removed.code, 'NOT_FOUND');
  }

  assert.deepEqual(await membersOf(hers, grace), [
    { userId: grace.id, name: 'Grace', role: 'owner' },
    { userId: linus.id, name: 'Linus', role: 'editor' }
  ]);
});

test('only the owner changes or removes members: an editor and a viewer are FORBIDDEN, and nothing changes', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await make(ada);
  await add(spaceId, grace, 'editor');
  await add(spaceId, linus, 'viewer');

  for (const [caller, target] of [
    [grace, linus],
    [linus, grace]
  ] as const) {
    const updated = await api.as(caller)(updateMember, { spaceId, userId: target.id, role: 'viewer' });
    const removed = await api.as(caller)(removeMember, { spaceId, userId: target.id });

    assert.equal(!updated.ok && updated.code, 'FORBIDDEN');
    assert.equal(!removed.ok && removed.code, 'FORBIDDEN');
  }

  assert.deepEqual(await membersOf(spaceId, ada), [
    { userId: ada.id, name: 'Ada', role: 'owner' },
    { userId: grace.id, name: 'Grace', role: 'editor' },
    { userId: linus.id, name: 'Linus', role: 'viewer' }
  ]);
});

test('leaveSpace: an editor and a viewer leave on their own, and the space no longer exists for them', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await make(ada);
  await add(spaceId, grace, 'editor');
  await add(spaceId, linus, 'viewer');

  for (const person of [grace, linus]) {
    assert.deepEqual(await api.as(person)(leaveSpace, { spaceId }), { ok: true, data: {} });
    assert.equal(await membersOf(spaceId, person), 'UNKNOWN_SPACE');
    // Someone who is not in a space has nothing to leave
    const again = await api.as(person)(leaveSpace, { spaceId });
    assert.equal(!again.ok && again.code, 'UNKNOWN_SPACE');
  }

  assert.deepEqual(await membersOf(spaceId, ada), [{ userId: ada.id, name: 'Ada', role: 'owner' }]);
});
