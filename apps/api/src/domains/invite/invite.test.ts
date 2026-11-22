import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createInvite,
  deleteInvite,
  getInvites,
  INVITE_LIFETIME_DAYS,
  joinSpace
} from '@pocketmice/contract/domains/invite';
import { createSpace, getMembers, getSpaces } from '@pocketmice/contract/domains/space';
import { spaceInvites } from '@pocketmice/db/schema/invite';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';

const api = useTestApi();

/** Makes a space as this person and returns its id */
async function make(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

/** Makes an invite to the space as its owner and returns it */
async function invite(owner: CurrentUser, spaceId: string, role: 'editor' | 'viewer' = 'editor') {
  const result = await api.as(owner)(createInvite, { spaceId, role });
  assert.ok(result.ok, `createInvite should have worked: ${JSON.stringify(result)}`);
  return result.data.invite;
}

/** The roles of the members of the space, by name */
async function rolesIn(spaceId: string, asPerson: CurrentUser) {
  const result = await api.as(asPerson)(getMembers, { spaceId });
  assert.ok(result.ok, `getMembers should have worked: ${JSON.stringify(result)}`);
  return Object.fromEntries(result.data.members.map((member) => [member.name, member.role]));
}

test('createInvite makes an invite that gives the role asked for and works for seven days', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await make(ada);
  const before = Date.now();

  const made = await invite(ada, spaceId, 'viewer');

  assert.equal(made.role, 'viewer');
  const lifetime = Date.parse(made.expiresAt) - before;
  const expected = INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(lifetime - expected) < 60_000, `it should expire in seven days, and expires in ${lifetime} ms`);
});

test('joinSpace puts the caller into the space in the role the invite gives, and answers with the space', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await make(ada);
  const made = await invite(ada, spaceId, 'editor');

  assert.deepEqual(await api.as(grace)(joinSpace, { inviteId: made.id }), {
    ok: true,
    data: { space: { id: spaceId, name: 'Research notes', role: 'editor' } }
  });

  assert.deepEqual(await api.as(grace)(getSpaces, {}), {
    ok: true,
    data: { spaces: [{ id: spaceId, name: 'Research notes', role: 'editor' }] }
  });
  assert.deepEqual(await rolesIn(spaceId, grace), { Ada: 'owner', Grace: 'editor' });
});

test('one invite lets in everyone who has it, each in the role it gives', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await make(ada);
  const made = await invite(ada, spaceId, 'viewer');

  for (const person of [grace, linus]) {
    const joined = await api.as(person)(joinSpace, { inviteId: made.id });
    assert.equal(joined.ok && joined.data.space.role, 'viewer');
  }

  assert.deepEqual(await rolesIn(spaceId, ada), { Ada: 'owner', Grace: 'viewer', Linus: 'viewer' });
});

test('someone who is a member already stays in the role they have, whatever the invite gives', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await make(ada);
  await api.as(grace)(joinSpace, { inviteId: (await invite(ada, spaceId, 'editor')).id });
  const lower = await invite(ada, spaceId, 'viewer');

  // An editor opens an invite for viewers, and the owner opens their own invite
  const asEditor = await api.as(grace)(joinSpace, { inviteId: lower.id });
  const asOwner = await api.as(ada)(joinSpace, { inviteId: lower.id });

  assert.equal(asEditor.ok && asEditor.data.space.role, 'editor');
  assert.equal(asOwner.ok && asOwner.data.space.role, 'owner');
  assert.deepEqual(await rolesIn(spaceId, ada), { Ada: 'owner', Grace: 'editor' });
});

test('getInvites lists the invites to the space that still work, the oldest first', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await make(ada);
  const other = await make(ada, 'Reports');
  const first = await invite(ada, spaceId, 'editor');
  const expired = await invite(ada, spaceId, 'editor');
  const second = await invite(ada, spaceId, 'viewer');
  await invite(ada, other, 'editor');
  await api.db
    .update(spaceInvites)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(spaceInvites.id, expired.id));

  assert.deepEqual(await api.as(ada)(getInvites, { spaceId }), { ok: true, data: { invites: [first, second] } });
});

test('an invite past its time lets nobody in', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await make(ada);
  const made = await invite(ada, spaceId);
  await api.db
    .update(spaceInvites)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(spaceInvites.id, made.id));

  const joined = await api.as(grace)(joinSpace, { inviteId: made.id });

  assert.deepEqual(joined, { ok: false, code: 'NOT_FOUND', message: 'There is no such invite, or it has expired.' });
  assert.deepEqual(await rolesIn(spaceId, ada), { Ada: 'owner' });
});

test('deleteInvite stops the invite from working; whoever joined with it stays a member', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await make(ada);
  const made = await invite(ada, spaceId);
  await api.as(grace)(joinSpace, { inviteId: made.id });

  assert.deepEqual(await api.as(ada)(deleteInvite, { spaceId, inviteId: made.id }), { ok: true, data: {} });

  const late = await api.as(linus)(joinSpace, { inviteId: made.id });
  assert.equal(!late.ok && late.code, 'NOT_FOUND');
  assert.deepEqual(await api.as(ada)(getInvites, { spaceId }), { ok: true, data: { invites: [] } });
  assert.deepEqual(await rolesIn(spaceId, ada), { Ada: 'owner', Grace: 'editor' });
});

test('deleting an invite the space does not have is NOT_FOUND, and an invite to another space keeps working', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const mine = await make(ada);
  const hers = await make(grace, 'Reports');
  const toHers = await invite(grace, hers);

  for (const inviteId of [toHers.id, NOBODY]) {
    const deleted = await api.as(ada)(deleteInvite, { spaceId: mine, inviteId });
    assert.equal(!deleted.ok && deleted.code, 'NOT_FOUND');
  }

  const joined = await api.as(ada)(joinSpace, { inviteId: toHers.id });
  assert.equal(joined.ok && joined.data.space.id, hers);
});

test('joining with an id that is no invite is NOT_FOUND, and signed out is UNAUTHENTICATED', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await make(ada);
  const made = await invite(ada, spaceId);

  const unknown = await api.as(ada)(joinSpace, { inviteId: NOBODY });
  const signedOut = await api.as(null)(joinSpace, { inviteId: made.id });

  assert.equal(!unknown.ok && unknown.code, 'NOT_FOUND');
  assert.equal(!signedOut.ok && signedOut.code, 'UNAUTHENTICATED');
});

test('only the owner makes, sees and deletes invites: other members are FORBIDDEN, and the space does not exist for anyone else', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const linus = await api.addPerson('Linus');
  const spaceId = await make(ada);
  const made = await invite(ada, spaceId, 'editor');
  await api.as(grace)(joinSpace, { inviteId: made.id });

  for (const [person, code] of [
    [grace, 'FORBIDDEN'],
    [linus, 'UNKNOWN_SPACE']
  ] as const) {
    const created = await api.as(person)(createInvite, { spaceId, role: 'viewer' });
    const listed = await api.as(person)(getInvites, { spaceId });
    const deleted = await api.as(person)(deleteInvite, { spaceId, inviteId: made.id });

    assert.equal(!created.ok && created.code, code);
    assert.equal(!listed.ok && listed.code, code);
    assert.equal(!deleted.ok && deleted.code, code);
  }

  assert.deepEqual(await api.as(ada)(getInvites, { spaceId }), { ok: true, data: { invites: [made] } });
});

test('an invite never gives the role of owner', async () => {
  const ada = await api.addPerson('Ada');
  const spaceId = await make(ada);

  // @ts-expect-error -- owner is not a role that can be given
  const result = await api.as(ada)(createInvite, { spaceId, role: 'owner' });

  assert.equal(!result.ok && result.code, 'INVALID_INPUT');
});
