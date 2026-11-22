import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiKeyAuthorization, apiKeyName, bearerToken } from './apiKey.ts';

test('a key is sent as a bearer token, and read back from the header as it was sent', () => {
  assert.equal(apiKeyAuthorization('pm_abc'), 'Bearer pm_abc');
  assert.equal(bearerToken(apiKeyAuthorization('pm_abc')), 'pm_abc');
  // The scheme is written in any case
  assert.equal(bearerToken('bearer pm_abc'), 'pm_abc');
});

test('a header that is absent, or holds something other than one bearer token, has no token', () => {
  for (const header of [null, undefined, '', 'Bearer', 'Bearer ', 'Basic dXNlcjpwYXNz', 'pm_abc', 'Bearer a b']) {
    assert.equal(bearerToken(header), null, `"${header}"`);
  }
});

test('the name of a key is trimmed, is not empty after that, and has a limit', () => {
  assert.equal(apiKeyName.parse('  Research agent '), 'Research agent');
  assert.equal(apiKeyName.safeParse('   ').success, false);
  assert.equal(apiKeyName.safeParse('a'.repeat(50)).success, true);
  assert.equal(apiKeyName.safeParse('a'.repeat(51)).success, false);
});
