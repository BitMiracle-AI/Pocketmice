import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portFromEnv, requireEnv, requireOrigins } from './env.ts';

test('a variable that must be set and is missing or empty is an error that names it', () => {
  delete process.env.TEST_REQUIRED;
  assert.throws(() => requireEnv('TEST_REQUIRED'), /Missing environment variable TEST_REQUIRED/);

  process.env.TEST_REQUIRED = '';
  assert.throws(() => requireEnv('TEST_REQUIRED'), /Missing environment variable TEST_REQUIRED/);

  process.env.TEST_REQUIRED = 'value';
  assert.equal(requireEnv('TEST_REQUIRED'), 'value');
});

test('web origins separated by commas are read as a list; the spaces around them do not count', () => {
  process.env.TEST_ORIGINS = 'http://localhost:11211, https://app.example.com';

  assert.deepEqual(requireOrigins('TEST_ORIGINS'), ['http://localhost:11211', 'https://app.example.com']);
});

test('an origin with a trailing slash, with a path, or that is no address at all is an error', () => {
  for (const wrong of [
    'http://localhost:11211/',
    'https://app.example.com/login',
    'localhost:11211',
    'app.example.com'
  ]) {
    process.env.TEST_ORIGINS = wrong;

    assert.throws(() => requireOrigins('TEST_ORIGINS'), /TEST_ORIGINS.*invalid origin/, `"${wrong}" should fail`);
  }
});

test('a port that is not set is the fallback; one that is set is used', () => {
  delete process.env.TEST_PORT;
  assert.equal(portFromEnv('TEST_PORT', 11210), 11210);

  process.env.TEST_PORT = '54321';
  assert.equal(portFromEnv('TEST_PORT', 11210), 54321);
});

test('a port set to something that is not a port number is an error', () => {
  for (const wrong of ['abc', '0', '70000', '80.5']) {
    process.env.TEST_PORT = wrong;

    assert.throws(() => portFromEnv('TEST_PORT', 11210), /TEST_PORT.*port number/, `"${wrong}" should fail`);
  }
});
