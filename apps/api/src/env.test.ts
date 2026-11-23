import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostFromEnv, mailFromEnv, portFromEnv, requireEnv, requireOrigins, storageFromEnv } from './env.ts';

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

/** Runs with exactly these settings, of the ones named, in the environment, and puts back what was there */
function withEnv<Result>(names: string[], settings: Record<string, string>, run: () => Result): Result {
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

/** Runs with exactly these storage settings in the environment */
function withStorageEnv<Result>(settings: Record<string, string>, run: () => Result): Result {
  const names = [
    'S3_BUCKET',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_ENDPOINT',
    'S3_PUBLIC_ENDPOINT',
    'S3_FORCE_PATH_STYLE'
  ];
  return withEnv(names, settings, run);
}

/** Runs with exactly these mail settings in the environment */
function withMailEnv<Result>(settings: Record<string, string>, run: () => Result): Result {
  return withEnv(['SMTP_URL', 'MAIL_FROM', 'MAIL_TO_CONSOLE'], settings, run);
}

const S3 = { S3_BUCKET: 'files', S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'id', S3_SECRET_ACCESS_KEY: 'secret' };

test('files are kept in the bucket the environment names', () => {
  assert.deepEqual(withStorageEnv(S3, storageFromEnv), {
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
  assert.deepEqual([minio.endpoint, minio.forcePathStyle], ['http://localhost:9000', true]);

  // A server that reaches its bucket over an inner network says where callers reach it
  const inner = withStorageEnv(
    { ...S3, S3_ENDPOINT: 'https://s3.inner.example.com', S3_PUBLIC_ENDPOINT: 'https://s3.example.com' },
    storageFromEnv
  );
  assert.deepEqual([inner.endpoint, inner.publicEndpoint], ['https://s3.inner.example.com', 'https://s3.example.com']);
  assert.equal(minio.publicEndpoint, undefined);
});

test('no bucket, or a bucket with part of its settings missing or wrong, is an error', () => {
  assert.throws(() => withStorageEnv({}, storageFromEnv), /Missing environment variable S3_BUCKET/);
  assert.throws(
    () => withStorageEnv({ ...S3, S3_SECRET_ACCESS_KEY: '' }, storageFromEnv),
    /Missing environment variable S3_SECRET_ACCESS_KEY/
  );
  assert.throws(() => withStorageEnv({ ...S3, S3_FORCE_PATH_STYLE: 'yes' }, storageFromEnv), /true or false/);
  for (const endpoint of ['localhost:9000', 'minio', 'ftp://localhost:9000']) {
    assert.throws(() => withStorageEnv({ ...S3, S3_ENDPOINT: endpoint }, storageFromEnv), /not an address/, endpoint);
    assert.throws(
      () => withStorageEnv({ ...S3, S3_PUBLIC_ENDPOINT: endpoint }, storageFromEnv),
      /S3_PUBLIC_ENDPOINT is not an address/,
      endpoint
    );
  }
});

const MAIL = { SMTP_URL: 'smtp://mailer:secret@smtp.example.com:587', MAIL_FROM: 'Pocketmice <noreply@example.com>' };

test('a server sends mail when both mail settings are there, and none when neither is', () => {
  assert.deepEqual(withMailEnv(MAIL, mailFromEnv), { kind: 'smtp', smtpUrl: MAIL.SMTP_URL, from: MAIL.MAIL_FROM });
  assert.deepEqual(withMailEnv({ ...MAIL, SMTP_URL: 'smtps://smtp.example.com' }, mailFromEnv), {
    kind: 'smtp',
    smtpUrl: 'smtps://smtp.example.com',
    from: MAIL.MAIL_FROM
  });
  assert.equal(withMailEnv({}, mailFromEnv), null);
  assert.equal(withMailEnv({ SMTP_URL: '', MAIL_FROM: '' }, mailFromEnv), null);
  assert.equal(withMailEnv({ MAIL_TO_CONSOLE: 'false' }, mailFromEnv), null);
  assert.deepEqual(withMailEnv({ ...MAIL, MAIL_TO_CONSOLE: 'false' }, mailFromEnv), {
    kind: 'smtp',
    smtpUrl: MAIL.SMTP_URL,
    from: MAIL.MAIL_FROM
  });
});

test('mail is printed and not sent when the environment says so, which does not go with an SMTP server', () => {
  assert.deepEqual(withMailEnv({ MAIL_TO_CONSOLE: 'true' }, mailFromEnv), { kind: 'console' });

  assert.throws(() => withMailEnv({ ...MAIL, MAIL_TO_CONSOLE: 'true' }, mailFromEnv), /Set one/);
  assert.throws(() => withMailEnv({ MAIL_FROM: MAIL.MAIL_FROM, MAIL_TO_CONSOLE: 'true' }, mailFromEnv), /Set one/);
  assert.throws(() => withMailEnv({ MAIL_TO_CONSOLE: 'yes' }, mailFromEnv), /MAIL_TO_CONSOLE must be true or false/);
});

test('one mail setting without the other, or one that is wrong, is an error that does not repeat the password', () => {
  assert.throws(() => withMailEnv({ SMTP_URL: MAIL.SMTP_URL }, mailFromEnv), /SMTP_URL is set and MAIL_FROM is not/);
  assert.throws(() => withMailEnv({ MAIL_FROM: MAIL.MAIL_FROM }, mailFromEnv), /MAIL_FROM is set and SMTP_URL is not/);
  for (const smtpUrl of [
    'smtp.example.com:587',
    'mailer:secret@smtp.example.com',
    'https://mailer:secret@example.com'
  ]) {
    assert.throws(
      () => withMailEnv({ ...MAIL, SMTP_URL: smtpUrl }, mailFromEnv),
      (error: Error) => /SMTP_URL is not the address/.test(error.message) && !error.message.includes('secret'),
      smtpUrl
    );
  }
  for (const from of ['Pocketmice', 'noreply@', '@example.com']) {
    assert.throws(() => withMailEnv({ ...MAIL, MAIL_FROM: from }, mailFromEnv), /MAIL_FROM has no email address/, from);
  }
});
