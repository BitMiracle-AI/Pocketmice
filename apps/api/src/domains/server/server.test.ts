import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getServerInfo } from '@pocketmice/contract/domains/server';
import { useTestApi } from '../testing.ts';

const api = useTestApi();

test('getServerInfo answers anyone with the version the server was started with', async () => {
  assert.deepEqual(await api.as(null)(getServerInfo, {}), { ok: true, data: { version: '1.2.3' } });
});
