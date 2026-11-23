import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostFromEnv, portFromEnv, requireEnv, requireOrigins, storageFromEnv } from './env.ts';

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

test('an address to listen on that is not set, or is empty, is the fallback; one that is set is used', () => {
  delete process.env.TEST_HOST;
  assert.equal(hostFromEnv('TEST_HOST', '127.0.0.1'), '127.0.0.1');

  process.env.TEST_HOST = '';
  assert.equal(hostFromEnv('TEST_HOST', '127.0.0.1'), '127.0.0.1');

  process.env.TEST_HOST = '0.0.0.0';
  assert.equal(hostFromEnv('TEST_HOST', '127.0.0.1'), '0.0.0.0');
});

/** Runs with exactly these storage settings in the environment, and puts back what was there */
function withStorageEnv<Result>(settings: Record<string, string>, run: () => Result): Result {
  const names = [
    'STORAGE_DIR',
    'S3_BUCKET',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_ENDPOINT',
    'S3_FORCE_PATH_STYLE'
  ];
  const before = names.map((name) => [name, process.env[name]] as const);
  for (const name of names) delete process.env[name];
  Object.assign(process.env, settings);
  try {
    return run();
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const S3 = { S3_BUCKET: 'files', S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' };

test('files are kept in a folder or in a bucket, whichever is configured', () => {
  assert.deepEqual(withStorageEnv({ STORAGE_DIR: './data/storage' }, storageFromEnv), {
    kind: 'folder',
    dir: './data/storage'
  });
  assert.deepEqual(withStorageEnv(S3, storageFromEnv), {
    kind: 's3',
    bucket: 'files',
    region: 'us-east-1',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    forcePathStyle: false
  });
  const minio = withStorageEnv(
    { ...S3, S3_ENDPOINT: 'http://localhost:9000', S3_FORCE_PATH_STYLE: 'true' },
    storageFromEnv
  );
  assert.deepEqual(
    [minio.kind === 's3' && minio.endpoint, minio.kind === 's3' && minio.forcePathStyle],
    ['http://localhost:9000', true]
  );
});

test('both places configured, neither, or a bucket with part of its settings missing or wrong is an error', () => {
  assert.throws(() => withStorageEnv({ ...S3, STORAGE_DIR: './data/storage' }, storageFromEnv), /Both STORAGE_DIR/);
  assert.throws(() => withStorageEnv({}, storageFromEnv), /Neither STORAGE_DIR nor S3_BUCKET/);
  assert.throws(
    () => withStorageEnv({ ...S3, S3_SECRET_ACCESS_KEY: '' }, storageFromEnv),
    /Missing environment variable S3_SECRET_ACCESS_KEY/
  );
  assert.throws(() => withStorageEnv({ ...S3, S3_FORCE_PATH_STYLE: 'yes' }, storageFromEnv), /true or false/);
  for (const endpoint of ['localhost:9000', 'minio', 'ftp://localhost:9000']) {
    assert.throws(() => withStorageEnv({ ...S3, S3_ENDPOINT: endpoint }, storageFromEnv), /not an address/, endpoint);
  }
});
