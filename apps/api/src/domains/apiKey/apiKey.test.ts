import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  API_KEY_PREFIX,
  type ApiKeyPermission,
  apiKeyAuthorization,
  createApiKey,
  deleteApiKey,
  getApiKeys
} from '@pocketmice/contract/domains/apiKey';
import { createInvite, deleteInvite, getInvites, joinSpace } from '@pocketmice/contract/domains/invite';
import { getProfile, updateProfile } from '@pocketmice/contract/domains/profile';
import {
  createSpace,
  getMembers,
  getSpaces,
  leaveSpace,
  removeMember,
  updateMember
} from '@pocketmice/contract/domains/space';
import { apiKeys } from '@pocketmice/db/schema/apiKey';
import { users } from '@pocketmice/db/schema/auth';
import { spaceMembers } from '@pocketmice/db/schema/space';
import { eq } from 'drizzle-orm';
import type { CurrentUser } from '../../http/operation.ts';
import { NOBODY, useTestApi } from '../testing.ts';
import { identifyCaller } from './identifyCaller.ts';

const api = useTestApi();

/** Makes a key as this person, signed in, and returns what they are told about it, and the key itself on its own */
async function makeKey(person: CurrentUser, permission: ApiKeyPermission, name = 'Research agent') {
  const result = await api.as(person)(createApiKey, { name, permission });
  assert.ok(result.ok, `createApiKey should have worked: ${JSON.stringify(result)}`);
  return { apiKey: result.data.apiKey, key: result.data.apiKey.key };
}

/** Makes a space as this person and returns its id */
async function makeSpace(owner: CurrentUser, name = 'Research notes') {
  const result = await api.as(owner)(createSpace, { name });
  assert.ok(result.ok, `createSpace should have worked: ${JSON.stringify(result)}`);
  return result.data.space.id;
}

test('createApiKey makes a key under the name, trimmed, and shows the key itself', async () => {
  const ada = await api.addPerson('Ada');
  const before = Date.now();

  const { apiKey, key } = await makeKey(ada, 'read', '  Research agent ');

  assert.equal(apiKey.name, 'Research agent');
  assert.equal(apiKey.permission, 'read');
  assert.ok(Math.abs(Date.parse(apiKey.createdAt) - before) < 60_000);
  // The prefix, then 32 random bytes in 43 characters
  assert.match(key, new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9_-]{43}$`));
  assert.notEqual((await makeKey(ada, 'read')).key, key);
});

test('the database keeps the key as it is, in a row of the person who made it', async () => {
  const ada = await api.addPerson('Ada');

  const { apiKey, key } = await makeKey(ada, 'write');

  const [row] = await api.db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
  assert.ok(row);
  assert.equal(row.key, key);
  assert.equal(row.userId, ada.id);
  assert.equal(row.deletedAt, null);
});

test('getApiKeys lists the keys of the caller, the oldest first, each with the key itself to copy again, and none of anyone else', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const first = await makeKey(ada, 'read', 'Reader');
  await makeKey(grace, 'write', 'Hers');
  const second = await makeKey(ada, 'write', 'Writer');

  const listed = await api.as(ada)(getApiKeys, {});

  assert.deepEqual(listed, { ok: true, data: { apiKeys: [first.apiKey, second.apiKey] } });
  assert.deepEqual(Object.keys(first.apiKey).sort(), ['createdAt', 'id', 'key', 'name', 'permission']);
  // The key shown again is the key that works
  const shownAgain = listed.ok ? listed.data.apiKeys.map((apiKey) => apiKey.key) : [];
  assert.deepEqual(shownAgain, [first.key, second.key]);
  assert.equal((await api.withKey(shownAgain[0] ?? '')(getProfile, {})).ok, true);
});

test('an agent with a key is the person whose key it is: it sees their profile and their spaces, in the role they have', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const mine = await makeSpace(ada, 'Research notes');
  const hers = await makeSpace(grace, 'Reports');
  await api.db.insert(spaceMembers).values({ spaceId: hers, userId: ada.id, role: 'viewer' });
  const agent = api.withKey((await makeKey(ada, 'read')).key);

  assert.deepEqual(await agent(getProfile, {}), { ok: true, data: { id: ada.id, email: ada.email, name: 'Ada' } });
  assert.deepEqual(await agent(getSpaces, {}), {
    ok: true,
    data: {
      spaces: [
        { id: mine, name: 'Research notes', role: 'owner' },
        { id: hers, name: 'Reports', role: 'viewer' }
      ]
    }
  });
  const members = await agent(getMembers, { spaceId: hers });
  assert.equal(members.ok && members.data.members.length, 2);
});

test('a key with the write permission changes things as the person', async () => {
  const ada = await api.addPerson('Ada');
  const agent = api.withKey((await makeKey(ada, 'write')).key);

  const made = await agent(createSpace, { name: 'Made by the agent' });
  const renamed = await agent(updateProfile, { name: 'Ada Lovelace' });

  assert.equal(made.ok && made.data.space.role, 'owner');
  assert.equal(renamed.ok && renamed.data.name, 'Ada Lovelace');
  // What the agent did is the person's: they see it signed in
  const spaces = await api.as(ada)(getSpaces, {});
  assert.deepEqual(spaces.ok && spaces.data.spaces.map((space) => space.name), ['Made by the agent']);
});

test('a read-only key reads and changes nothing', async () => {
  const ada = await api.addPerson('Ada');
  const agent = api.withKey((await makeKey(ada, 'read')).key);

  const made = await agent(createSpace, { name: 'Made by the agent' });
  const renamed = await agent(updateProfile, { name: 'Ada Lovelace' });

  assert.equal(!made.ok && made.code, 'FORBIDDEN');
  assert.equal(!renamed.ok && renamed.code, 'FORBIDDEN');
  assert.deepEqual(await agent(getSpaces, {}), { ok: true, data: { spaces: [] } });
  assert.deepEqual(await agent(getProfile, {}), { ok: true, data: { id: ada.id, email: ada.email, name: 'Ada' } });
});

test('no key decides who can get in: keys, members and invites are FORBIDDEN to it, even the key of the owner', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'editor' });
  const invited = await api.as(ada)(createInvite, { spaceId, role: 'viewer', storageLimit: null });
  assert.ok(invited.ok);
  const inviteId = invited.data.invite.id;

  for (const permission of ['read', 'write'] as const) {
    const mine = await makeKey(ada, permission);
    const agent = api.withKey(mine.key);
    // The key of an editor, for the two things an editor does themselves: joining and leaving
    const theirs = api.withKey((await makeKey(grace, permission)).key);

    const results = [
      await agent(createApiKey, { name: 'Another', permission: 'write' }),
      await agent(getApiKeys, {}),
      await agent(deleteApiKey, { apiKeyId: mine.apiKey.id }),
      await agent(createInvite, { spaceId, role: 'editor', storageLimit: null }),
      await agent(getInvites, { spaceId }),
      await agent(deleteInvite, { spaceId, inviteId }),
      await agent(updateMember, { spaceId, userId: grace.id, role: 'viewer' }),
      await agent(removeMember, { spaceId, userId: grace.id }),
      await theirs(joinSpace, { inviteId }),
      await theirs(leaveSpace, { spaceId })
    ];

    assert.deepEqual(
      results.map((result) => !result.ok && result.code),
      results.map(() => 'FORBIDDEN'),
      `with a ${permission} key`
    );
  }

  // Nothing moved: the same members, the same invite, and no key that a key made
  const members = await api.as(ada)(getMembers, { spaceId });
  assert.deepEqual(members.ok && members.data.members.map((member) => [member.name, member.role]), [
    ['Ada', 'owner'],
    ['Grace', 'editor']
  ]);
  const invites = await api.as(ada)(getInvites, { spaceId });
  assert.deepEqual(invites.ok && invites.data.invites.map((invite) => invite.id), [inviteId]);
  const keys = await api.as(ada)(getApiKeys, {});
  assert.deepEqual(keys.ok && keys.data.apiKeys.map((apiKey) => apiKey.name), ['Research agent', 'Research agent']);
});

test('a key gets into the spaces its person is in now: taken out of a space, their key is out too', async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const spaceId = await makeSpace(ada);
  await api.db.insert(spaceMembers).values({ spaceId, userId: grace.id, role: 'editor' });
  const agent = api.withKey((await makeKey(grace, 'write')).key);
  assert.equal((await agent(getMembers, { spaceId })).ok, true);

  await api.as(ada)(removeMember, { spaceId, userId: grace.id });

  const after = await agent(getMembers, { spaceId });
  assert.equal(!after.ok && after.code, 'UNKNOWN_SPACE');
});

test('deleteApiKey stops the key from working: a request sent with it is from nobody', async () => {
  const ada = await api.addPerson('Ada');
  const kept = await makeKey(ada, 'read', 'Kept');
  const gone = await makeKey(ada, 'read', 'Gone');

  assert.deepEqual(await api.as(ada)(deleteApiKey, { apiKeyId: gone.apiKey.id }), { ok: true, data: {} });

  const after = await api.withKey(gone.key)(getProfile, {});
  assert.equal(!after.ok && after.code, 'UNAUTHENTICATED');
  assert.equal((await api.withKey(kept.key)(getProfile, {})).ok, true);
  assert.deepEqual(await api.as(ada)(getApiKeys, {}), { ok: true, data: { apiKeys: [kept.apiKey] } });
});

test('a deleted key keeps its row, marked with the time, and deleting it again is NOT_FOUND', async () => {
  const ada = await api.addPerson('Ada');
  const { apiKey, key } = await makeKey(ada, 'write', 'Gone');
  const before = Date.now();
  await api.as(ada)(deleteApiKey, { apiKeyId: apiKey.id });

  const [row] = await api.db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
  // What was done with the key can still name it
  assert.equal(row?.name, 'Gone');
  assert.ok(row?.deletedAt && Math.abs(row.deletedAt.getTime() - before) < 60_000);

  const again = await api.as(ada)(deleteApiKey, { apiKeyId: apiKey.id });
  assert.equal(!again.ok && again.code, 'NOT_FOUND');
  // The second try changed nothing: the time is the one of the first, and the key still does not work
  const [after] = await api.db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
  assert.deepEqual(after?.deletedAt, row.deletedAt);
  const called = await api.withKey(key)(getProfile, {});
  assert.equal(!called.ok && called.code, 'UNAUTHENTICATED');
});

test("deleting a key that is not the caller's is NOT_FOUND, and the key keeps working", async () => {
  const ada = await api.addPerson('Ada');
  const grace = await api.addPerson('Grace');
  const hers = await makeKey(grace, 'read');

  for (const apiKeyId of [hers.apiKey.id, NOBODY]) {
    const deleted = await api.as(ada)(deleteApiKey, { apiKeyId });
    assert.equal(!deleted.ok && deleted.code, 'NOT_FOUND');
  }

  assert.equal((await api.withKey(hers.key)(getProfile, {})).ok, true);
});

test('a bearer token that is no key is nobody, and the session is not looked at instead', async () => {
  const ada = await api.addPerson('Ada');
  const { apiKey, key } = await makeKey(ada, 'read');
  let askedSession = 0;
  const identify = identifyCaller(api.db, async () => {
    askedSession += 1;
    return { user: ada };
  });
  const sentWith = (token: string) => identify(new Headers({ authorization: apiKeyAuthorization(token) }));

  // A key that was never made, a key with a character changed, and a token of some other kind
  for (const token of [
    `${API_KEY_PREFIX}${'A'.repeat(43)}`,
    `${key.slice(0, -1)}${key.endsWith('A') ? 'B' : 'A'}`,
    'abc'
  ]) {
    assert.deepEqual(await sentWith(token), { user: null }, token);
  }
  assert.equal(askedSession, 0);

  // The real key is the person; without a bearer token it is the session that tells
  assert.deepEqual(await sentWith(key), { user: ada, apiKey: { id: apiKey.id, permission: 'read' } });
  assert.deepEqual(await identify(new Headers()), { user: ada });
  assert.deepEqual(await identify(new Headers({ authorization: 'Basic dXNlcjpwYXNz' })), { user: ada });
  assert.equal(askedSession, 2);
});

test('createApiKey refuses a name that is empty or too long and a permission that does not exist, and makes nothing', async () => {
  const ada = await api.addPerson('Ada');

  for (const input of [
    { name: '', permission: 'read' },
    { name: '   ', permission: 'read' },
    { name: 'a'.repeat(51), permission: 'read' },
    { name: 'Research agent', permission: 'admin' }
  ]) {
    const result = await api.as(ada)(createApiKey, input as never);
    assert.equal(!result.ok && result.code, 'INVALID_INPUT', JSON.stringify(input).slice(0, 40));
  }

  assert.deepEqual(await api.as(ada)(getApiKeys, {}), { ok: true, data: { apiKeys: [] } });
});

test('the operations on keys signed out are UNAUTHENTICATED', async () => {
  const results = [
    await api.as(null)(createApiKey, { name: 'Research agent', permission: 'read' }),
    await api.as(null)(getApiKeys, {}),
    await api.as(null)(deleteApiKey, { apiKeyId: NOBODY })
  ];

  assert.deepEqual(
    results.map((result) => !result.ok && result.code),
    ['UNAUTHENTICATED', 'UNAUTHENTICATED', 'UNAUTHENTICATED']
  );
});

test('the keys of a user go when the user is deleted', async () => {
  const ada = await api.addPerson('Ada');
  const { key } = await makeKey(ada, 'read');

  await api.db.delete(users).where(eq(users.id, ada.id));

  assert.equal((await api.db.select().from(apiKeys).where(eq(apiKeys.userId, ada.id))).length, 0);
  const after = await api.withKey(key)(getProfile, {});
  assert.equal(!after.ok && after.code, 'UNAUTHENTICATED');
});
